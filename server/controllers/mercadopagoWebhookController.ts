/**
 * Mercado Pago Webhook Controller
 * Processa notificações de pagamento e assinatura
 */

import type { Request, Response } from "express";
import { getMercadoPagoService } from "../services/MercadoPagoService";
import { getSubscriptionService } from "../services/SubscriptionService";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { log } from "../services/promptContext/logger";
import {
  trackSubscriptionPaid,
  trackPaymentFailed,
  trackSubscriptionCreated,
} from "../services/mixpanel";
import { sendAbundanciaWelcomeEmail } from "../services/EmailService";

// Mapa de prefixo do external_reference → product_key
const PRODUCT_REF_PREFIXES: Record<string, string> = {
  sono_: "protocolo_sono_7_noites",
  abundancia_: "protocolo_abundancia_7_dias",
};

/** Retorna product_key se o external_reference for de produto avulso, ou null se for assinatura */
function getProductKeyFromReference(ref: string | null | undefined): string | null {
  if (!ref) return null;
  for (const [prefix, productKey] of Object.entries(PRODUCT_REF_PREFIXES)) {
    if (ref.startsWith(prefix)) return productKey;
  }
  return null;
}

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
 * Processa notificação de pagamento.
 * Bifurca entre produto avulso (entitlement) e assinatura recorrente.
 */
async function handlePaymentNotification(paymentId: string): Promise<void> {
  try {
    const mpService = getMercadoPagoService();

    const payment = await mpService.getPayment(paymentId);
    const externalReference = payment.external_reference as string | undefined;
    const paymentMethod = payment.payment_method_id as string | undefined;
    const transactionAmount = payment.transaction_amount as number | undefined;
    const payerEmail = (payment.payer as any)?.email as string | undefined;

    logger.info("payment_notification_processing", {
      paymentId,
      status: payment.status,
      externalReference,
    });

    // ── Produto avulso (sono, abundância, etc.) ───────────────────────────
    const productKey = getProductKeyFromReference(externalReference);
    if (productKey) {
      await handleProductPayment({
        paymentId,
        productKey,
        externalReference: externalReference!,
        status: payment.status as string,
        payerEmail,
        transactionAmount,
      });
      return;
    }

    // ── Assinatura recorrente ─────────────────────────────────────────────
    const subscriptionService = getSubscriptionService();
    const userId = externalReference;

    if (!userId) {
      logger.error("payment_missing_user_id", { paymentId });
      return;
    }

    const planType = extractPlanType(payment);

    if (payment.status === "approved") {
      logger.info("subscription_payment_approved", { userId, paymentId, planType, amount: transactionAmount });

      const plan = planType === "essentials" ? "essentials_monthly" :
                   planType === "monthly" ? "premium_monthly" : "premium_annual";
      const durationDays = planType === "annual" ? 365 : 30;

      await subscriptionService.activateSubscription(userId, plan, durationDays, {
        provider: "mercadopago",
        provider_payment_id: paymentId,
        payment_status: payment.status,
        payment_method: paymentMethod,
        amount: transactionAmount,
      });

      trackSubscriptionPaid(userId, {
        plan_id: planType,
        mp_status: payment.status,
        payment_method: paymentMethod,
        transaction_amount: transactionAmount,
        mp_id: paymentId,
      });

      await subscriptionService.recordEvent(userId, "payment_approved", {
        payment_id: paymentId,
        plan: planType,
        amount: transactionAmount,
        payment_method: paymentMethod,
      });
    } else if (payment.status === "rejected") {
      logger.warn("subscription_payment_rejected", { userId, paymentId, statusDetail: payment.status_detail });

      trackPaymentFailed(userId, {
        plan_id: planType,
        mp_status: payment.status,
        error_message: payment.status_detail as string,
        mp_id: paymentId,
      });

      await subscriptionService.recordEvent(userId, "payment_rejected", {
        payment_id: paymentId,
        plan: planType,
        reason: payment.status_detail,
      });
    } else if (payment.status === "pending") {
      logger.info("subscription_payment_pending", { userId, paymentId, statusDetail: payment.status_detail });

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
 * Processa pagamento de produto avulso: cria/atualiza entitlement na tabela.
 */
async function handleProductPayment(params: {
  paymentId: string;
  productKey: string;
  externalReference: string;
  status: string;
  payerEmail?: string;
  transactionAmount?: number;
}): Promise<void> {
  const { paymentId, productKey, externalReference, status, payerEmail, transactionAmount } = params;

  try {
    if (status !== "approved") {
      logger.info("product_payment_not_approved", { paymentId, productKey, status });
      return;
    }

    const supabase = ensureSupabaseConfigured();

    // Upsert: cria ou reativa entitlement (idempotente por external_reference)
    const { error } = await supabase
      .from("entitlements")
      .upsert(
        {
          product_key: productKey,
          external_reference: externalReference,
          payment_id: String(paymentId),
          email: payerEmail ?? null,
          status: "active",
          // user_id fica null até o frontend chamar /api/entitlements/claim
        },
        { onConflict: "external_reference", ignoreDuplicates: false }
      );

    if (error) {
      logger.error("product_entitlement_upsert_error", { paymentId, productKey, error: error.message });
      return;
    }

    logger.info("product_entitlement_created", { paymentId, productKey, externalReference, transactionAmount });

    // Dispara e-mail de boas-vindas para produtos que têm e-mail do pagador
    if (payerEmail) {
      if (productKey === "protocolo_abundancia_7_dias") {
        sendAbundanciaWelcomeEmail({ to: payerEmail, externalReference }).catch((err) =>
          logger.error("abundancia_email_dispatch_failed", { payerEmail, error: err instanceof Error ? err.message : String(err) })
        );
      }
    }
  } catch (error) {
    logger.error("handle_product_payment_failed", {
      paymentId,
      productKey,
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

      // Preapproval (recorrente) agora é sempre o plano mensal premium (R$15,90).
      // essentials descontinuado; o anual é via Preference (não preapproval).
      const planType = "monthly";

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

      // Preapproval recorrente = plano mensal premium.
      const planType = "monthly";

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

  // Fallback: inferir pelo valor.
  // essentials descontinuado; planos atuais: monthly R$15,90 / annual R$142,80.
  // Importante: NÃO usar limiar de R$20 (o mensal R$15,90 cairia em essentials).
  const amount = payment.transaction_amount as number;
  if (amount >= 100) {
    return "annual"; // R$ 142,80
  }
  return "monthly"; // R$ 15,90
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
