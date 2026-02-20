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

const logger = log.withContext("webhook-controller");

/**
 * Process payment event from Mercado Pago webhook
 *
 * Handles annual subscription payments (one-time)
 */
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

    const userId = payment.external_reference;

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
