/**
 * Mercado Pago Webhook Controller
 * Processa notificações de pagamento e assinatura
 */

import type { Request, Response } from "express";
import { getMercadoPagoService } from "../services/MercadoPagoService";
import { getSubscriptionService } from "../services/SubscriptionService";
import { log } from "../services/promptContext/logger";
import {
  trackSubscriptionPaid,
  trackPaymentFailed,
  trackSubscriptionCreated,
} from "../services/mixpanel";

const logger = log.withContext("mercadopago-webhook");

/**
 * Tipos de notificação do Mercado Pago
 */
type NotificationType = "payment" | "subscription_preapproval" | "subscription_authorized_payment";

/**
 * Estrutura do webhook do Mercado Pago
 */
interface MercadoPagoWebhook {
  id?: string;
  live_mode?: boolean;
  type?: string;
  date_created?: string;
  application_id?: string;
  user_id?: string;
  version?: string;
  api_version?: string;
  action?: string;
  data?: {
    id: string;
  };
}

/**
 * POST /api/webhooks/mercadopago
 *
 * Recebe notificações do Mercado Pago sobre pagamentos e assinaturas
 *
 * Eventos tratados:
 * - payment: Pagamento único (plano anual) ou recorrente (plano mensal)
 * - subscription_preapproval: Criação/atualização de assinatura recorrente
 * - subscription_authorized_payment: Pagamento autorizado de assinatura
 */
export async function handleMercadoPagoWebhook(req: Request, res: Response) {
  try {
    const webhook: MercadoPagoWebhook = req.body;

    logger.info("webhook_received", {
      type: webhook.type,
      action: webhook.action,
      dataId: webhook.data?.id,
    });

    // Responder imediatamente para Mercado Pago (obrigatório)
    res.status(200).json({ received: true });

    // Processar webhook assincronamente
    if (!webhook.type || !webhook.data?.id) {
      logger.warn("webhook_invalid_payload", { webhook });
      return;
    }

    const type = webhook.type as NotificationType;
    const resourceId = webhook.data.id;

    // Processar baseado no tipo
    switch (type) {
      case "payment":
      case "subscription_authorized_payment":
        await handlePaymentNotification(resourceId);
        break;

      case "subscription_preapproval":
        await handlePreapprovalNotification(resourceId);
        break;

      default:
        logger.debug("webhook_type_ignored", { type });
    }
  } catch (error) {
    logger.error("webhook_processing_error", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Não retornar erro para Mercado Pago (já respondemos 200)
  }
}

/**
 * Processa notificação de pagamento
 */
async function handlePaymentNotification(paymentId: string): Promise<void> {
  try {
    const mpService = getMercadoPagoService();
    const subscriptionService = getSubscriptionService();

    // Buscar detalhes do pagamento no Mercado Pago
    const payment = await mpService.getPayment(paymentId);

    logger.info("payment_notification_processing", {
      paymentId,
      status: payment.status,
      externalReference: payment.external_reference,
    });

    const userId = payment.external_reference as string;

    if (!userId) {
      logger.error("payment_missing_user_id", { paymentId });
      return;
    }

    // Extrair dados do pagamento
    const planType = extractPlanType(payment);
    const paymentMethod = payment.payment_method_id as string | undefined;
    const transactionAmount = payment.transaction_amount as number | undefined;

    // Processar baseado no status
    if (payment.status === "approved") {
      // ✅ Pagamento aprovado
      logger.info("payment_approved", {
        userId,
        paymentId,
        planType,
        amount: transactionAmount,
      });

      // Determinar plano e duração
      const plan = planType === "essentials" ? "essentials_monthly" :
                   planType === "monthly" ? "premium_monthly" : "premium_annual";
      const durationDays = planType === "annual" ? 365 : 30; // essentials e monthly = 30 dias

      // Atualizar assinatura no banco
      await subscriptionService.activateSubscription(
        userId,
        plan,
        durationDays,
        {
          provider: "mercadopago",
          provider_payment_id: paymentId,
          payment_status: payment.status,
          payment_method: paymentMethod,
          amount: transactionAmount,
        }
      );

      // Track Subscription Paid (Mixpanel - Camada 3)
      trackSubscriptionPaid(userId, {
        plan_id: planType,
        mp_status: payment.status,
        payment_method: paymentMethod,
        transaction_amount: transactionAmount,
        mp_id: paymentId,
      });

      // Registrar evento
      await subscriptionService.recordEvent(userId, "payment_approved", {
        payment_id: paymentId,
        plan: planType,
        amount: transactionAmount,
        payment_method: paymentMethod,
      });
    } else if (payment.status === "rejected") {
      // ❌ Pagamento rejeitado
      logger.warn("payment_rejected", {
        userId,
        paymentId,
        statusDetail: payment.status_detail,
      });

      // Track Payment Failed (Mixpanel - Camada 3)
      trackPaymentFailed(userId, {
        plan_id: planType,
        mp_status: payment.status,
        error_message: payment.status_detail as string,
        mp_id: paymentId,
      });

      // Registrar evento
      await subscriptionService.recordEvent(userId, "payment_rejected", {
        payment_id: paymentId,
        plan: planType,
        reason: payment.status_detail,
      });
    } else if (payment.status === "pending") {
      // ⏳ Pagamento pendente (ex: PIX aguardando confirmação)
      logger.info("payment_pending", {
        userId,
        paymentId,
        statusDetail: payment.status_detail,
      });

      // Registrar evento
      await subscriptionService.recordEvent(userId, "payment_pending", {
        payment_id: paymentId,
        plan: planType,
        reason: payment.status_detail,
      });
    }
  } catch (error) {
    logger.error("payment_notification_failed", {
      paymentId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Processa notificação de preapproval (assinatura recorrente)
 */
async function handlePreapprovalNotification(preapprovalId: string): Promise<void> {
  try {
    const mpService = getMercadoPagoService();
    const subscriptionService = getSubscriptionService();

    // Buscar detalhes do preapproval no Mercado Pago
    const preapproval = await mpService.getPreapproval(preapprovalId);

    logger.info("preapproval_notification_processing", {
      preapprovalId,
      status: preapproval.status,
      externalReference: preapproval.external_reference,
    });

    const userId = preapproval.external_reference as string;

    if (!userId) {
      logger.error("preapproval_missing_user_id", { preapprovalId });
      return;
    }

    if (preapproval.status === "authorized") {
      // ✅ Assinatura autorizada (trial iniciado)
      logger.info("preapproval_authorized", {
        userId,
        preapprovalId,
      });

      // Detectar se é essentials ou monthly pelo valor
      const amount = preapproval.auto_recurring?.transaction_amount as number | undefined;
      const planType = !amount || amount >= 20 ? "monthly" : "essentials"; // R$ 14.90 = essentials, R$ 29.90 = monthly

      // Ativar trial de 7 dias
      await subscriptionService.activateSubscription(
        userId,
        "trial", // Trial para ambos (essentials e monthly)
        7, // 7 dias de trial
        {
          provider: "mercadopago",
          provider_preapproval_id: preapprovalId,
          payment_status: "authorized",
          plan_type: planType, // Salvar qual plano será após o trial
        }
      );

      // Track Subscription Created (Mixpanel - Camada 3)
      trackSubscriptionCreated(userId, {
        plan_id: planType,
        mp_status: preapproval.status,
        preapproval_id: preapprovalId,
      });

      // Registrar evento
      await subscriptionService.recordEvent(userId, "subscription_authorized", {
        preapproval_id: preapprovalId,
        plan: planType,
      });
    } else if (preapproval.status === "cancelled") {
      // ❌ Assinatura cancelada
      logger.info("preapproval_cancelled", {
        userId,
        preapprovalId,
      });

      // Detectar plano pelo valor
      const amount = preapproval.auto_recurring?.transaction_amount as number | undefined;
      const planType = !amount || amount >= 20 ? "monthly" : "essentials";

      // Cancelar assinatura no banco
      await subscriptionService.cancelSubscription(userId);

      // Registrar evento
      await subscriptionService.recordEvent(userId, "subscription_cancelled_by_provider", {
        preapproval_id: preapprovalId,
        plan: planType,
      });
    }
  } catch (error) {
    logger.error("preapproval_notification_failed", {
      preapprovalId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Extrai tipo de plano do pagamento
 */
function extractPlanType(payment: any): "essentials" | "monthly" | "annual" {
  // Tentar extrair do metadata primeiro
  if (payment.metadata?.plan_type) {
    return payment.metadata.plan_type;
  }

  // Fallback: inferir pelo valor
  const amount = payment.transaction_amount as number;
  if (amount >= 200) {
    return "annual"; // R$ 299
  } else if (amount >= 20) {
    return "monthly"; // R$ 29.90
  } else {
    return "essentials"; // R$ 14.90
  }
}

/**
 * Getter singleton para service (compatibilidade com padrão existente)
 */
let webhookControllerInstance: {
  handleMercadoPagoWebhook: typeof handleMercadoPagoWebhook;
} | null = null;

export function getWebhookController() {
  if (!webhookControllerInstance) {
    webhookControllerInstance = {
      handleMercadoPagoWebhook,
    };
  }
  return webhookControllerInstance;
}
