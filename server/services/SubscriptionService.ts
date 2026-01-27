import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { log } from "./promptContext/logger";

const logger = log.withContext("subscription-service");

/**
 * Subscription plan types
 */
type PlanType = "monthly" | "annual";

/**
 * Subscription status
 */
type SubscriptionStatus = "active" | "cancelled" | "expired" | "pending";

/**
 * User subscription data from database
 */
interface UsuarioData {
  id: string;
  plan_type: PlanType | null;
  subscription_status: SubscriptionStatus;
  trial_start_date: string | null;
  trial_end_date: string | null;
  access_until: string | null;
  current_period_end: string | null;
  provider_preapproval_id: string | null;
  provider_payment_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Calculated subscription status for client
 */
export interface SubscriptionStatusResponse {
  plan: "free" | "trial" | "premium_monthly" | "premium_annual";
  isPremium: boolean;
  isTrialActive: boolean;
  trialDaysRemaining: number | null;
  subscriptionStatus: SubscriptionStatus;
  accessUntil: string | null;
  currentPeriodEnd: string | null;
  canReactivate: boolean;
}

/**
 * Payment record data
 */
export interface PaymentData {
  provider_payment_id: string;
  status: "approved" | "pending" | "rejected" | "refunded" | "cancelled";
  amount: number;
  plan: PlanType;
  payment_method?: string;
  receipt_url?: string;
  raw_payload?: any;
}

/**
 * Subscription event types
 */
export type SubscriptionEventType =
  | "checkout_initiated"
  | "trial_started"
  | "subscription_renewed"
  | "payment_approved"
  | "payment_failed"
  | "subscription_cancelled"
  | "subscription_reactivated"
  | "subscription_expired";

/**
 * Service for subscription business logic
 *
 * Handles:
 * - Subscription status calculation
 * - User subscription CRUD operations
 * - Payment recording
 * - Event tracking
 */
export class SubscriptionService {
  private supabase: SupabaseClient;

  constructor(supabase?: SupabaseClient) {
    this.supabase = supabase || ensureSupabaseConfigured();
  }

  /**
   * Get comprehensive subscription status for a user
   *
   * Calculates current plan based on:
   * - access_until date (has premium access?)
   * - trial_end_date (currently in trial?)
   * - subscription_status (active, cancelled, expired?)
   *
   * @param userId - User ID to check
   * @returns Subscription status object
   */
  async getStatus(userId: string): Promise<SubscriptionStatusResponse> {
    try {
      logger.debug("fetching_subscription_status", { userId });

      const { data, error } = await this.supabase
        .from("usuarios")
        .select("*")
        .eq("id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = not found (expected for new users)
        throw error;
      }

      const usuario = data as UsuarioData | null;

      // No subscription record = free user
      if (!usuario) {
        return {
          plan: "free",
          isPremium: false,
          isTrialActive: false,
          trialDaysRemaining: null,
          subscriptionStatus: "pending",
          accessUntil: null,
          currentPeriodEnd: null,
          canReactivate: false,
        };
      }

      const now = new Date();
      const accessUntil = usuario.access_until ? new Date(usuario.access_until) : null;
      const trialEndDate = usuario.trial_end_date ? new Date(usuario.trial_end_date) : null;

      // Calculate plan and status
      const hasAccess = accessUntil && accessUntil > now;
      const isInTrial = trialEndDate && trialEndDate > now && usuario.subscription_status === "active";
      const trialDaysRemaining = isInTrial && trialEndDate
        ? Math.ceil((trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      let plan: SubscriptionStatusResponse["plan"] = "free";
      let isPremium = false;

      if (isInTrial) {
        plan = "trial";
        isPremium = true;
      } else if (hasAccess && usuario.plan_type === "monthly") {
        plan = "premium_monthly";
        isPremium = true;
      } else if (hasAccess && usuario.plan_type === "annual") {
        plan = "premium_annual";
        isPremium = true;
      }

      // Can reactivate if monthly subscription was cancelled but preapproval still exists
      const canReactivate =
        usuario.plan_type === "monthly" &&
        usuario.subscription_status === "cancelled" &&
        !!usuario.provider_preapproval_id;

      const status: SubscriptionStatusResponse = {
        plan,
        isPremium,
        isTrialActive: !!isInTrial,
        trialDaysRemaining,
        subscriptionStatus: usuario.subscription_status,
        accessUntil: usuario.access_until,
        currentPeriodEnd: usuario.current_period_end,
        canReactivate,
      };

      logger.debug("subscription_status_calculated", { userId, plan, isPremium });

      return status;
    } catch (error) {
      logger.error("get_subscription_status_failed", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create or update user subscription record
   *
   * @param userId - User ID
   * @param data - Subscription data to update
   */
  async createOrUpdateUser(userId: string, data: Partial<UsuarioData>): Promise<void> {
    try {
      logger.debug("upserting_user_subscription", { userId, data });

      const { error } = await this.supabase
        .from("usuarios")
        .upsert({
          id: userId,
          ...data,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        throw error;
      }

      logger.info("user_subscription_updated", { userId });
    } catch (error) {
      logger.error("update_user_subscription_failed", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Cancel subscription (set status to cancelled, keep access_until)
   *
   * @param userId - User ID
   */
  async cancelSubscription(userId: string): Promise<void> {
    try {
      logger.info("cancelling_subscription", { userId });

      const { error } = await this.supabase
        .from("usuarios")
        .update({
          subscription_status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) {
        throw error;
      }

      logger.info("subscription_cancelled", { userId });
    } catch (error) {
      logger.error("cancel_subscription_failed", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Reactivate subscription (monthly only)
   *
   * @param userId - User ID
   */
  async reactivateSubscription(userId: string): Promise<void> {
    try {
      logger.info("reactivating_subscription", { userId });

      const { error } = await this.supabase
        .from("usuarios")
        .update({
          subscription_status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) {
        throw error;
      }

      logger.info("subscription_reactivated", { userId });
    } catch (error) {
      logger.error("reactivate_subscription_failed", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Record a payment transaction
   *
   * @param userId - User ID
   * @param paymentData - Payment details
   */
  async recordPayment(userId: string, paymentData: PaymentData): Promise<void> {
    try {
      logger.debug("recording_payment", { userId, paymentId: paymentData.provider_payment_id });

      const { error } = await this.supabase.from("payments").insert({
        user_id: userId,
        provider_payment_id: paymentData.provider_payment_id,
        status: paymentData.status,
        amount: paymentData.amount,
        plan: paymentData.plan,
        payment_method: paymentData.payment_method,
        receipt_url: paymentData.receipt_url,
        raw_payload: paymentData.raw_payload,
      });

      if (error) {
        // Ignore duplicate payment errors (idempotency)
        if (error.code === "23505") {
          logger.warn("duplicate_payment_record", { paymentId: paymentData.provider_payment_id });
          return;
        }
        throw error;
      }

      logger.info("payment_recorded", { userId, paymentId: paymentData.provider_payment_id });
    } catch (error) {
      logger.error("record_payment_failed", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Record a subscription event for audit trail
   *
   * @param userId - User ID
   * @param eventType - Event type
   * @param metadata - Additional event data
   */
  async recordEvent(
    userId: string,
    eventType: SubscriptionEventType,
    metadata?: {
      plan?: PlanType;
      provider_id?: string;
      [key: string]: any;
    }
  ): Promise<void> {
    try {
      logger.debug("recording_subscription_event", { userId, eventType });

      const { error } = await this.supabase.from("subscription_events").insert({
        user_id: userId,
        event_type: eventType,
        plan: metadata?.plan || null,
        provider_id: metadata?.provider_id || null,
        metadata: metadata || {},
      });

      if (error) {
        throw error;
      }

      logger.debug("subscription_event_recorded", { userId, eventType });
    } catch (error) {
      logger.error("record_event_failed", {
        userId,
        eventType,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - event recording failure shouldn't break the flow
    }
  }

  /**
   * Get user's payment history
   *
   * @param userId - User ID
   * @param limit - Maximum number of payments to return
   * @returns Array of payment records
   */
  async getPayments(userId: string, limit: number = 50): Promise<any[]> {
    try {
      logger.debug("fetching_payments", { userId, limit });

      const { data, error } = await this.supabase
        .from("payments")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error("get_payments_failed", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

/**
 * Singleton instance
 */
let subscriptionServiceInstance: SubscriptionService | null = null;

/**
 * Get or create SubscriptionService singleton
 */
export function getSubscriptionService(): SubscriptionService {
  if (!subscriptionServiceInstance) {
    subscriptionServiceInstance = new SubscriptionService();
  }
  return subscriptionServiceInstance;
}
