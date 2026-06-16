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
import { sendSonoWelcomeEmail, sendAbundanciaWelcomeEmail } from "../services/EmailService";
import { sendMetaEvent } from "../services/metaCapi";
import crypto from "crypto";

const logger = log.withContext("webhook-controller");

/** Preço mensal real (R$) usado no value dos eventos CAPI do funil do sono. */
const MONTHLY_PRICE_BRL = 15.9;
const CURRENCY_BRL = "BRL";

/**
 * Busca a atribuição Meta salva no checkout (create-with-card). Retorna null se
 * não houver — o CAPI server-side simplesmente não dispara nesse caso.
 */
async function getMetaAttribution(supabase: any, preapprovalId: string, userId: string) {
  const { data } = await supabase
    .from("meta_capi_attribution")
    .select("*")
    .eq("preapproval_id", preapprovalId)
    .maybeSingle();
  if (data) return data;
  // Fallback por usuário (caso o preapproval_id não bata por algum motivo).
  const { data: byUser } = await supabase
    .from("meta_capi_attribution")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return byUser ?? null;
}

/** Resolve o e-mail do usuário para o user_data do CAPI (hasheado no serviço). */
async function resolveUserEmail(
  supabase: any,
  userId: string,
  fallbackEmail?: string | null
): Promise<string | null> {
  if (fallbackEmail) return fallbackEmail;
  const { data } = await supabase.from("usuarios").select("email").eq("id", userId).maybeSingle();
  return data?.email ?? null;
}

/**
 * Process payment event from Mercado Pago webhook
 *
 * Handles annual subscription payments (one-time)
 */
const PRODUCT_KEY_BY_PREFIX: Record<string, string> = {
  sono: "protocolo_sono_7_noites",
  abundancia: "protocolo_abundancia_7_dias",
};

async function processProductEntitlement(paymentId: string, payment: any, productKey: string): Promise<void> {
  const supabase = ensureSupabaseConfigured();
  const extRef = payment.external_reference as string;

  const status = payment.status === "approved" ? "active" : "pending";

  const { error } = await supabase.from("entitlements").upsert(
    {
      external_reference: extRef,
      product_key: productKey,
      status,
      payment_id: String(paymentId),
      email: payment.payer?.email ?? null,
      utm_data: payment.metadata?.utm ?? null,
    },
    { onConflict: "external_reference" }
  );

  if (error) {
    logger.error("entitlement_upsert_failed", { paymentId, extRef, productKey, error: error.message });
    throw error;
  }

  logger.info("product_entitlement_upserted", { paymentId, extRef, productKey, status });

  // Enviar e-mail de boas-vindas — apenas quando aprovado e ainda não enviado.
  // Guard atômico: UPDATE WHERE welcome_email_sent_at IS NULL garante que apenas
  // um webhook "vence" mesmo quando o MP dispara dois em paralelo
  // (payment.created → payment.updated, ou Pix pending → approved).
  if (status === "active") {
    const { data: claimed } = await supabase
      .from("entitlements")
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq("external_reference", extRef)
      .is("welcome_email_sent_at", null)
      .select("email")
      .maybeSingle();

    if (!claimed) {
      logger.info("product_welcome_email_already_sent", { paymentId, extRef, productKey });
    } else {
      const payerEmail = (claimed.email ?? payment.payer?.email) as string | undefined;
      const appUrl = process.env.APP_URL || "https://ecofrontend888.vercel.app";

      if (payerEmail) {
        if (productKey === "protocolo_abundancia_7_dias") {
          await sendAbundanciaWelcomeEmail({ to: payerEmail, externalReference: extRef, appUrl });
        } else {
          await sendSonoWelcomeEmail({ to: payerEmail, externalReference: extRef, appUrl });
        }
        logger.info("product_welcome_email_sent", { paymentId, extRef, productKey, to: payerEmail });
      } else {
        logger.warn("product_welcome_email_skipped_no_email", { paymentId, extRef, productKey });
      }
    }
  }
}

async function processPaymentEvent(paymentId: string): Promise<void> {
  const mpService = getMercadoPagoService();
  const subService = getSubscriptionService();
  const supabase = ensureSupabaseConfigured();

  try {
    logger.info("processing_payment_event", { paymentId });

    // Fetch payment details from Mercado Pago
    const payment = await mpService.getPayment(paymentId);

    if (!payment) {
      logger.warn("payment_not_found", { paymentId });
      return;
    }

    const extRef = payment.external_reference ?? "";

    // ── Produtos avulsos (Sono, Abundância) ──────────────────────────────────
    const productPrefix = Object.keys(PRODUCT_KEY_BY_PREFIX).find((p) => extRef.startsWith(`${p}_`));
    if (productPrefix) {
      const productKey = PRODUCT_KEY_BY_PREFIX[productPrefix];
      await processProductEntitlement(paymentId, payment, productKey);
      return;
    }

    // ── Assinatura recorrente (código original) ───────────────────────────────
    const userId = extRef;

    if (!userId) {
      logger.warn("payment_missing_external_reference", { paymentId });
      return;
    }

    logger.debug("payment_fetched", {
      paymentId,
      userId,
      status: payment.status,
    });

    // Handle approved payment (annual subscription)
    if (payment.status === "approved") {
      const accessUntil = new Date();
      accessUntil.setFullYear(accessUntil.getFullYear() + 1); // +1 year

      // Update user subscription
      await supabase.from("usuarios").upsert({
        id: userId,
        plan_type: "annual",
        subscription_status: "active",
        provider_payment_id: paymentId,
        access_until: accessUntil.toISOString(),
        current_period_end: accessUntil.toISOString(),
        trial_start_date: null,
        trial_end_date: null,
        updated_at: new Date().toISOString(),
      });

      // Record event
      await subService.recordEvent(userId, "payment_approved", {
        plan: "annual",
        provider_id: paymentId,
      });

      // Record payment
      await subService.recordPayment(userId, {
        provider_payment_id: paymentId,
        status: "approved",
        amount: payment.transaction_amount || 299.0,
        plan: "annual",
        payment_method: payment.payment_method_id || null,
        receipt_url: payment.receipt_url || null,
        raw_payload: payment,
      });

      // Track Subscription Paid (Mixpanel - Camada 3)
      trackSubscriptionPaid(userId, {
        plan_id: "annual",
        mp_status: payment.status,
        payment_method: payment.payment_method_id,
        transaction_amount: payment.transaction_amount || 299.0,
        mp_id: paymentId,
      });

      logger.info("annual_payment_processed", { userId, paymentId });
    } else if (payment.status === "rejected" || payment.status === "cancelled") {
      // Record failed payment
      await subService.recordEvent(userId, "payment_failed", {
        plan: "annual",
        provider_id: paymentId,
        status: payment.status,
      });

      // Track Payment Failed (Mixpanel - Camada 3)
      trackPaymentFailed(userId, {
        plan_id: "annual",
        mp_status: payment.status,
        error_message: payment.status_detail || payment.status,
        mp_id: paymentId,
      });

      logger.info("payment_failed_or_cancelled", {
        userId,
        paymentId,
        status: payment.status,
      });
    }
  } catch (error) {
    logger.error("process_payment_event_failed", {
      paymentId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Process preapproval event from Mercado Pago webhook
 *
 * Handles monthly subscription lifecycle (trial, renewals, cancellation)
 */
async function processPreapprovalEvent(preapprovalId: string): Promise<void> {
  const mpService = getMercadoPagoService();
  const subService = getSubscriptionService();
  const supabase = ensureSupabaseConfigured();

  try {
    logger.info("processing_preapproval_event", { preapprovalId });

    // Fetch preapproval details from Mercado Pago
    const preapproval = await mpService.getPreapproval(preapprovalId);

    if (!preapproval) {
      logger.warn("preapproval_not_found", { preapprovalId });
      return;
    }

    const userId = preapproval.external_reference;

    if (!userId) {
      logger.warn("preapproval_missing_external_reference", { preapprovalId });
      return;
    }

    logger.debug("preapproval_fetched", {
      preapprovalId,
      userId,
      status: preapproval.status,
    });

    // Handle authorized preapproval
    if (preapproval.status === "authorized") {
      const isFirstCharge = !preapproval.summarize?.charged_quantity;

      if (isFirstCharge) {
        // Trial start (7 days)
        const now = new Date();
        const trialEnd = new Date(now);
        trialEnd.setDate(trialEnd.getDate() + 7);

        await supabase.from("usuarios").upsert({
          id: userId,
          plan_type: "monthly",
          subscription_status: "active",
          provider_preapproval_id: preapprovalId,
          trial_start_date: now.toISOString(),
          trial_end_date: trialEnd.toISOString(),
          access_until: trialEnd.toISOString(),
          current_period_end: trialEnd.toISOString(),
          updated_at: new Date().toISOString(),
        });

        await subService.recordEvent(userId, "trial_started", {
          plan: "monthly",
          provider_id: preapprovalId,
        });

        // Track Subscription Created (Mixpanel - Camada 3)
        trackSubscriptionCreated(userId, {
          plan_id: "monthly",
          mp_status: preapproval.status,
          preapproval_id: preapprovalId,
        });

        // Meta CAPI — StartTrial (fonte da verdade: trial autorizado pelo MP).
        // Reusa o event_id do client (deduplicação com o Pixel do browser).
        try {
          const attribution = await getMetaAttribution(supabase, preapprovalId, userId);
          if (attribution?.start_trial_event_id) {
            const email = await resolveUserEmail(
              supabase,
              userId,
              preapproval.payer_email
            );
            await sendMetaEvent({
              eventName: "StartTrial",
              eventId: attribution.start_trial_event_id,
              eventSourceUrl: attribution.event_source_url,
              userData: {
                email,
                fbp: attribution.fbp,
                fbc: attribution.fbc,
                clientIpAddress: attribution.client_ip,
                clientUserAgent: attribution.client_user_agent,
              },
              customData: {
                value: MONTHLY_PRICE_BRL,
                currency: CURRENCY_BRL,
                contentName: "ECO Premium",
                contentCategory: "subscription",
              },
            });
          } else {
            logger.info("start_trial_capi_skipped_no_attribution", { userId, preapprovalId });
          }
        } catch (capiError) {
          logger.warn("start_trial_capi_failed", {
            userId,
            preapprovalId,
            error: capiError instanceof Error ? capiError.message : String(capiError),
          });
        }

        logger.info("trial_started", { userId, preapprovalId });
      } else {
        // Monthly renewal
        const nextBilling = preapproval.next_payment_date
          ? new Date(preapproval.next_payment_date)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +30 days fallback

        await supabase
          .from("usuarios")
          .update({
            subscription_status: "active",
            access_until: nextBilling.toISOString(),
            current_period_end: nextBilling.toISOString(),
            trial_start_date: null,
            trial_end_date: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        await subService.recordEvent(userId, "subscription_renewed", {
          plan: "monthly",
          provider_id: preapprovalId,
        });

        // Track Subscription Paid para renovação mensal (Mixpanel - Camada 3)
        trackSubscriptionPaid(userId, {
          plan_id: "monthly",
          mp_status: preapproval.status,
          transaction_amount: 29.9,
          mp_id: preapprovalId,
        });

        // Meta CAPI — Subscribe (1ª cobrança real). O client já saiu, então
        // geramos o event_id no server (sem dedup com browser) e reaproveitamos
        // a atribuição salva (fbp/fbc/ip/ua) para a melhor correspondência.
        try {
          const attribution = await getMetaAttribution(supabase, preapprovalId, userId);
          const email = await resolveUserEmail(supabase, userId, preapproval.payer_email);
          await sendMetaEvent({
            eventName: "Subscribe",
            eventId: crypto.randomUUID(),
            eventSourceUrl: attribution?.event_source_url ?? null,
            userData: {
              email,
              fbp: attribution?.fbp ?? null,
              fbc: attribution?.fbc ?? null,
              clientIpAddress: attribution?.client_ip ?? null,
              clientUserAgent: attribution?.client_user_agent ?? null,
            },
            customData: {
              value: MONTHLY_PRICE_BRL,
              currency: CURRENCY_BRL,
              contentName: "ECO Premium",
              contentCategory: "subscription",
            },
          });
        } catch (capiError) {
          logger.warn("subscribe_capi_failed", {
            userId,
            preapprovalId,
            error: capiError instanceof Error ? capiError.message : String(capiError),
          });
        }

        logger.info("subscription_renewed", { userId, preapprovalId });
      }
    } else if (preapproval.status === "cancelled") {
      // Subscription cancelled
      await supabase
        .from("usuarios")
        .update({
          subscription_status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      await subService.recordEvent(userId, "subscription_cancelled", {
        plan: "monthly",
        provider_id: preapprovalId,
      });

      logger.info("subscription_cancelled_via_webhook", { userId, preapprovalId });
    }
  } catch (error) {
    logger.error("process_preapproval_event_failed", {
      preapprovalId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * POST /api/webhooks/mercadopago
 *
 * Webhook handler for Mercado Pago events
 *
 * CRITICAL REQUIREMENTS:
 * - Always return 200 OK (even on errors)
 * - Idempotent processing (check webhook_logs for duplicates)
 * - Validate webhook signature
 * - Log all events for debugging
 */
export async function mercadoPagoWebhookHandler(req: Request, res: Response) {
  const supabase = ensureSupabaseConfigured();

  try {
    const body = req.body;
    const headers = req.headers as any;

    logger.info("webhook_received", {
      type: body?.type,
      action: body?.action,
      id: body?.id,
    });

    // STEP 1: Validate signature
    const mpService = getMercadoPagoService();
    const isValid = mpService.validateWebhookSignature(headers, body);

    if (!isValid) {
      logger.warn("webhook_invalid_signature", {
        signature: headers["x-signature"],
      });
      // Still return 200 OK to prevent retries
      return res.status(200).json({ received: true });
    }

    // STEP 2: Idempotency check
    const eventId = body?.id || body?.data?.id || `unknown_${Date.now()}`;

    const { data: existingLog } = await supabase
      .from("webhook_logs")
      .select("id")
      .eq("source", "mercadopago")
      .eq("event_id", eventId)
      .maybeSingle();

    if (existingLog) {
      logger.info("webhook_duplicate", { eventId });
      return res.status(200).json({ received: true, duplicate: true });
    }

    // STEP 3: Log webhook
    await supabase.from("webhook_logs").insert({
      source: "mercadopago",
      event_type: body?.type || "unknown",
      event_id: eventId,
      payload: body,
      processed: false,
    });

    // STEP 4: Process event
    try {
      const eventType = body?.type;
      const dataId = body?.data?.id;

      if (!dataId) {
        logger.warn("webhook_missing_data_id", { eventId, type: eventType });
        // Mark as processed anyway
        await supabase
          .from("webhook_logs")
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
            error_message: "Missing data.id in webhook payload",
          })
          .eq("event_id", eventId);

        return res.status(200).json({ received: true });
      }

      if (eventType === "payment") {
        await processPaymentEvent(dataId);
      } else if (
        eventType === "subscription_preapproval" ||
        eventType === "subscription_authorized_payment"
      ) {
        await processPreapprovalEvent(dataId);
      } else {
        logger.info("webhook_unhandled_type", { eventId, type: eventType });
      }

      // Mark as processed
      await supabase
        .from("webhook_logs")
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
        })
        .eq("event_id", eventId);

      logger.info("webhook_processed", { eventId, type: eventType });
    } catch (processingError) {
      // Log error but STILL return 200 OK
      logger.error("webhook_processing_error", {
        eventId,
        error:
          processingError instanceof Error
            ? processingError.message
            : String(processingError),
      });

      await supabase
        .from("webhook_logs")
        .update({
          error_message:
            processingError instanceof Error
              ? processingError.message
              : String(processingError),
        })
        .eq("event_id", eventId);
    }

    // ALWAYS return 200 OK
    return res.status(200).json({ received: true });
  } catch (error) {
    // Even on catastrophic failure, return 200 OK
    logger.error("webhook_handler_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(200).json({ received: true, error: true });
  }
}
