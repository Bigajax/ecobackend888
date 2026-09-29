import type { Request, Response } from "express";
import { getMercadoPagoService } from "../services/MercadoPagoService";
import { getSubscriptionService } from "../services/SubscriptionService";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { log } from "../services/promptContext/logger";

const logger = log.withContext("subscription-controller");

/** IP do cliente a partir dos headers de proxy (nunca confiar no body). */
function resolveClientIp(req: Request): string | null {
  const fwd = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  return fwd || (req.headers["x-real-ip"] as string | undefined) || req.ip || null;
}

/**
 * Persiste a atribuição Meta enviada pelo client no checkout para o webhook do
 * Mercado Pago reusar (StartTrial/Subscribe via CAPI deduplicada). Não-fatal.
 */
async function saveMetaAttribution(
  req: Request,
  userId: string,
  preapprovalId: string
): Promise<void> {
  const metaEventId = typeof req.body?.metaEventId === "string" ? req.body.metaEventId : null;
  if (!metaEventId) return; // sem event_id do client não há o que correlacionar

  const purchaseEventId =
    typeof req.body?.purchaseEventId === "string" ? req.body.purchaseEventId : null;

  try {
    const supabase = ensureSupabaseConfigured();
    await supabase.from("meta_capi_attribution").upsert(
      {
        preapproval_id: String(preapprovalId),
        user_id: userId,
        start_trial_event_id: metaEventId,
        purchase_event_id: purchaseEventId,
        fbp: typeof req.body?.fbp === "string" ? req.body.fbp : null,
        fbc: typeof req.body?.fbc === "string" ? req.body.fbc : null,
        event_source_url:
          typeof req.body?.eventSourceUrl === "string" ? req.body.eventSourceUrl : null,
        client_ip: resolveClientIp(req),
        client_user_agent: (req.headers["user-agent"] as string | undefined) ?? null,
      },
      { onConflict: "preapproval_id" }
    );
    logger.info("meta_attribution_saved", { userId, preapprovalId });
  } catch (error) {
    logger.warn("meta_attribution_save_failed", {
      userId,
      preapprovalId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * In-memory cache for subscription status (60 second TTL)
 */
const statusCache = new Map<string, { status: any; timestamp: number }>();
const CACHE_TTL = 60 * 1000; // 60 seconds

/**
 * POST /api/subscription/create-with-card
 *
 * Start a monthly subscription with a 7-day free trial using a card token
 * collected on our page (MP CardPayment brick). R$0 charged today.
 *
 * Body (MP brick formData): { token, ...payer }
 * Returns: { id, status } from the created preapproval.
 */
export async function createWithCardHandler(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    const userEmail = req.user?.email;
    if (!userId || !userEmail) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Usuário não autenticado" });
    }

    const cardTokenId = req.body?.token;
    if (!cardTokenId || typeof cardTokenId !== "string") {
      return res.status(400).json({ error: "INVALID_BODY", message: "token do cartão é obrigatório" });
    }

    const planRaw = typeof req.body?.plan === "string" ? req.body.plan.trim().toLowerCase() : "monthly";
    const plan: "monthly" | "annual" = planRaw === "annual" ? "annual" : "monthly";

    const subscriptionService = getSubscriptionService();
    const currentStatus = await subscriptionService.getStatus(userId);
    if (currentStatus.isPremium && currentStatus.subscriptionStatus === "active") {
      return res.status(400).json({ error: "ALREADY_SUBSCRIBED", message: "Você já possui uma assinatura ativa" });
    }

    const mpService = getMercadoPagoService();
    const result = await mpService.createTrialSubscriptionWithCard(userId, userEmail, cardTokenId, plan);

    await subscriptionService.recordEvent(userId, "checkout_initiated", {
      plan,
      provider_id: result.id,
    });

    // Atribuição Meta para o CAPI server-side disparado no webhook do MP.
    await saveMetaAttribution(req, userId, result.id);

    logger.info("trial_with_card_created", { userId, preapprovalId: result.id, status: result.status });

    return res.status(200).json({ id: result.id, status: result.status });
  } catch (error) {
    logger.error("create_with_card_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(502).json({
      error: "PAYMENT_PROVIDER_ERROR",
      message: "Não foi possível iniciar a assinatura. Verifique os dados do cartão e tente novamente.",
    });
  }
}

/**
 * GET /api/subscription/status
 *
 * Get user's current subscription status
 *
 * Returns:
 * - plan: 'free' | 'trial' | 'premium_monthly' | 'premium_annual'
 * - isPremium: boolean
 * - isTrialActive: boolean
 * - trialDaysRemaining: number | null
 * - subscriptionStatus: 'active' | 'cancelled' | 'expired' | 'pending'
 * - accessUntil: string | null
 * - currentPeriodEnd: string | null
 * - canReactivate: boolean
 */
export async function getStatusHandler(req: Request, res: Response) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      logger.warn("get_status_unauthorized");
      return res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Usuário não autenticado",
      });
    }

    // Check cache
    const cached = statusCache.get(userId);
    const now = Date.now();

    if (cached && now - cached.timestamp < CACHE_TTL) {
      logger.debug("status_cache_hit", { userId });
      return res.status(200).json(cached.status);
    }

    // Fetch fresh status
    const subscriptionService = getSubscriptionService();
    const status = await subscriptionService.getStatus(userId);

    // Cache result
    statusCache.set(userId, { status, timestamp: now });

    logger.debug("status_fetched", { userId, plan: status.plan });

    return res.status(200).json(status);
  } catch (error) {
    logger.error("get_status_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro ao buscar status de assinatura",
    });
  }
}

/**
 * POST /api/subscription/cancel
 *
 * Cancel user's subscription (keeps access until period end)
 *
 * Body:
 * - reason: string (optional)
 *
 * Returns:
 * - message: success message
 * - accessUntil: date string
 */
export async function cancelHandler(req: Request, res: Response) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      logger.warn("cancel_unauthorized");
      return res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Usuário não autenticado",
      });
    }

    const subscriptionService = getSubscriptionService();

    // Get current subscription
    const status = await subscriptionService.getStatus(userId);

    if (!status.isPremium || status.subscriptionStatus === "cancelled") {
      logger.warn("cancel_no_active_subscription", { userId, status: status.subscriptionStatus });
      return res.status(400).json({
        error: "NO_ACTIVE_SUBSCRIPTION",
        message: "Você não possui uma assinatura ativa",
      });
    }

    // Cancela a recorrência no Mercado Pago sempre que existir, inclusive no
    // teste de 7 dias (plan="trial"). Antes só cancelava nos planos mensais
    // pagos: quem cancelava no teste era cobrado no dia 7.
    {
      const mpService = getMercadoPagoService();

      // Get preapproval ID from database
      const { data: usuario } = await subscriptionService["supabase"]
        .from("usuarios")
        .select("provider_preapproval_id")
        .eq("id", userId)
        .single();

      if (usuario?.provider_preapproval_id) {
        try {
          await mpService.cancelPreapproval(usuario.provider_preapproval_id);
          logger.info("preapproval_cancelled_with_mp", {
            userId,
            preapprovalId: usuario.provider_preapproval_id,
          });
        } catch (error) {
          logger.error("mp_cancel_preapproval_failed", {
            userId,
            error: error instanceof Error ? error.message : String(error),
          });
          // Sem cancelar no MP, a cobrança continua: não marca cancelado aqui.
          return res.status(502).json({
            error: "MP_CANCEL_FAILED",
            message: "Não foi possível cancelar agora. Tente de novo em alguns minutos.",
          });
        }
      }
    }

    // Update subscription status
    await subscriptionService.cancelSubscription(userId);

    // Record event
    await subscriptionService.recordEvent(userId, "subscription_cancelled", {
      plan: status.plan === "premium_monthly" ? "monthly" :
            status.plan === "essentials_monthly" ? "essentials" : "annual",
      reason: req.body?.reason || null,
    });

    // Clear cache
    statusCache.delete(userId);

    logger.info("subscription_cancelled", { userId });

    return res.status(200).json({
      message: "Assinatura cancelada com sucesso",
      accessUntil: status.accessUntil,
    });
  } catch (error) {
    logger.error("cancel_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro ao cancelar assinatura",
    });
  }
}

/**
 * POST /api/subscription/reactivate
 *
 * Reactivate a cancelled monthly subscription
 *
 * Returns:
 * - message: success message
 * - status: updated subscription status
 */
export async function reactivateHandler(req: Request, res: Response) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      logger.warn("reactivate_unauthorized");
      return res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Usuário não autenticado",
      });
    }

    const subscriptionService = getSubscriptionService();

    // Get current subscription
    const status = await subscriptionService.getStatus(userId);

    if (!status.canReactivate) {
      logger.warn("reactivate_not_eligible", { userId });
      return res.status(400).json({
        error: "NOT_ELIGIBLE",
        message: "Não é possível reativar esta assinatura",
      });
    }

    // Reactivate subscription
    await subscriptionService.reactivateSubscription(userId);

    // Record event
    await subscriptionService.recordEvent(userId, "subscription_reactivated", {
      plan: "monthly",
    });

    // Clear cache
    statusCache.delete(userId);

    // Get updated status
    const updatedStatus = await subscriptionService.getStatus(userId);

    logger.info("subscription_reactivated", { userId });

    return res.status(200).json({
      message: "Assinatura reativada com sucesso",
      status: updatedStatus,
    });
  } catch (error) {
    logger.error("reactivate_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro ao reativar assinatura",
    });
  }
}
