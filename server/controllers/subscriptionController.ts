import type { Request, Response } from "express";
import { getMercadoPagoService } from "../services/MercadoPagoService";
import { getSubscriptionService } from "../services/SubscriptionService";
import { log } from "../services/promptContext/logger";

const logger = log.withContext("subscription-controller");

/**
 * In-memory cache for subscription status (60 second TTL)
 */
const statusCache = new Map<string, { status: any; timestamp: number }>();
const CACHE_TTL = 60 * 1000; // 60 seconds

/**
 * Helper to normalize plan input
 */
function normalizePlan(plan: unknown): "essentials" | "monthly" | "annual" | null {
  if (typeof plan !== "string") return null;
  const normalized = plan.trim().toLowerCase();
  if (normalized === "essentials" || normalized === "monthly" || normalized === "annual") {
    return normalized;
  }
  return null;
}

/**
 * POST /api/subscription/create-preference
 *
 * Create a checkout preference for Mercado Pago
 *
 * Body:
 * - plan: 'monthly' | 'annual'
 *
 * Returns:
 * - initPoint: Mercado Pago checkout URL
 * - id: Preference/Preapproval ID
 * - type: 'preference' | 'preapproval'
 */
export async function createPreferenceHandler(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    const userEmail = req.user?.email;

    if (!userId || !userEmail) {
      logger.warn("create_preference_unauthorized", { userId, userEmail });
      return res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Usuário não autenticado",
      });
    }

    const plan = normalizePlan(req.body?.plan);

    if (!plan) {
      logger.warn("create_preference_invalid_plan", { userId, plan: req.body?.plan });
      return res.status(400).json({
        error: "INVALID_PLAN",
        message: "Plano inválido. Use 'essentials', 'monthly' ou 'annual'",
      });
    }

    // Check if user already has active subscription
    const subscriptionService = getSubscriptionService();
    const currentStatus = await subscriptionService.getStatus(userId);

    if (currentStatus.isPremium && currentStatus.subscriptionStatus === "active") {
      logger.warn("create_preference_already_subscribed", {
        userId,
        currentPlan: currentStatus.plan,
      });
      return res.status(400).json({
        error: "ALREADY_SUBSCRIBED",
        message: "Você já possui uma assinatura ativa",
      });
    }

    // Create checkout
    const mpService = getMercadoPagoService();
    const checkout = await mpService.createCheckout(userId, userEmail, plan);

    // Record event
    await subscriptionService.recordEvent(userId, "checkout_initiated", {
      plan,
      provider_id: checkout.id,
    });

    logger.info("checkout_created", { userId, plan, type: checkout.type });

    return res.status(200).json({
      initPoint: checkout.initPoint,
      id: checkout.id,
      type: checkout.type,
    });
  } catch (error) {
    logger.error("create_preference_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro ao criar preferência de pagamento",
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

    // If monthly or essentials plan, cancel preapproval with Mercado Pago
    if (status.plan === "premium_monthly" || status.plan === "essentials_monthly") {
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
          // Continue with local cancellation even if MP call fails
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

/**
 * GET /api/subscription/invoices
 *
 * Get user's payment history
 *
 * Query params:
 * - limit: number (default: 50, max: 100)
 *
 * Returns:
 * - payments: array of payment records
 */
export async function getInvoicesHandler(req: Request, res: Response) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      logger.warn("get_invoices_unauthorized");
      return res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Usuário não autenticado",
      });
    }

    const limitRaw = req.query?.limit;
    const limit = Math.min(
      parseInt(String(limitRaw), 10) || 50,
      100
    );

    const subscriptionService = getSubscriptionService();
    const payments = await subscriptionService.getPayments(userId, limit);

    logger.debug("invoices_fetched", { userId, count: payments.length });

    return res.status(200).json({
      payments,
    });
  } catch (error) {
    logger.error("get_invoices_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro ao buscar histórico de pagamentos",
    });
  }
}
