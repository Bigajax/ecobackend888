import { MercadoPagoConfig, Preference, PreApproval, Payment } from "mercadopago";
import crypto from "crypto";
import { log } from "./promptContext/logger";

const logger = log.withContext("mercadopago-service");

/**
 * Mercado Pago Service Configuration
 */
interface MPConfig {
  accessToken: string;
  publicKey: string;
  webhookSecret: string;
  appUrl: string;
  backendUrl: string;
}

/**
 * Checkout creation result
 */
interface CheckoutResult {
  initPoint: string;
  id: string;
  type: "preference" | "preapproval";
}

/**
 * Webhook validation headers
 */
interface WebhookHeaders {
  "x-signature"?: string;
  "x-request-id"?: string;
}

/**
 * Service for Mercado Pago integration
 *
 * Handles:
 * - Monthly subscription creation (Preapproval with 7-day trial)
 * - Annual subscription creation (Preference for one-time payment)
 * - Webhook signature validation
 * - Payment and preapproval data fetching
 */
export class MercadoPagoService {
  private client: MercadoPagoConfig;
  private config: MPConfig;

  constructor(config?: Partial<MPConfig>) {
    // Load configuration from environment with optional overrides
    this.config = {
      accessToken: config?.accessToken || process.env.MP_ACCESS_TOKEN || "",
      publicKey: config?.publicKey || process.env.MP_PUBLIC_KEY || "",
      webhookSecret: config?.webhookSecret || process.env.MP_WEBHOOK_SECRET || "",
      appUrl: config?.appUrl || process.env.APP_URL || "https://ecotopia.com",
      backendUrl: config?.backendUrl || process.env.BACKEND_URL || "https://ecobackend888.onrender.com",
    };

    // Validate required configuration
    if (!this.config.accessToken) {
      throw new Error("MP_ACCESS_TOKEN is required");
    }

    // Initialize Mercado Pago client
    this.client = new MercadoPagoConfig({
      accessToken: this.config.accessToken,
    });

    logger.info("mercadopago_service_initialized", {
      hasAccessToken: !!this.config.accessToken,
      hasWebhookSecret: !!this.config.webhookSecret,
    });
  }

  /**
   * Create checkout for subscription
   *
   * @param userId - User ID to link with subscription
   * @param userEmail - User email for payment notifications
   * @param plan - Plan type: 'monthly' or 'annual'
   * @returns Checkout URL and ID
   */
  async createCheckout(
    userId: string,
    userEmail: string,
    plan: "monthly" | "annual"
  ): Promise<CheckoutResult> {
    logger.info("creating_checkout", { userId, plan });

    if (plan === "monthly") {
      return this.createMonthlyPreapproval(userId, userEmail);
    } else {
      return this.createAnnualPreference(userId, userEmail);
    }
  }

  /**
   * Create monthly subscription with 7-day free trial
   *
   * Uses Mercado Pago Preapproval API for recurring payments
   */
  private async createMonthlyPreapproval(
    userId: string,
    userEmail: string
  ): Promise<CheckoutResult> {
    try {
      const preApprovalClient = new PreApproval(this.client);

      // Calculate trial dates
      const now = new Date();
      const trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + 7); // 7-day trial

      const response = await preApprovalClient.create({
        body: {
          reason: "Assinatura Premium ECO - Mensal",
          external_reference: userId,
          payer_email: userEmail,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: 29.9,
            currency_id: "BRL",
            free_trial: {
              frequency: 7,
              frequency_type: "days",
            },
          },
          back_url: `${this.config.appUrl}/subscription/success`,
          status: "pending",
        },
      });

      if (!response.init_point || !response.id) {
        throw new Error("Invalid preapproval response from Mercado Pago");
      }

      logger.info("monthly_preapproval_created", {
        userId,
        preapprovalId: response.id,
      });

      return {
        initPoint: response.init_point,
        id: response.id,
        type: "preapproval",
      };
    } catch (error) {
      logger.error("create_monthly_preapproval_failed", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create annual subscription (one-time payment)
   *
   * Uses Mercado Pago Preference API for single payment
   */
  private async createAnnualPreference(
    userId: string,
    userEmail: string
  ): Promise<CheckoutResult> {
    try {
      const preferenceClient = new Preference(this.client);

      const response = await preferenceClient.create({
        body: {
          items: [
            {
              id: "annual_subscription",
              title: "Assinatura Premium ECO - Anual",
              description: "Acesso ilimitado ao ECO por 1 ano",
              quantity: 1,
              unit_price: 299.0,
              currency_id: "BRL",
            },
          ],
          payer: {
            email: userEmail,
          },
          external_reference: userId,
          back_urls: {
            success: `${this.config.appUrl}/subscription/success`,
            failure: `${this.config.appUrl}/subscription/failure`,
            pending: `${this.config.appUrl}/subscription/pending`,
          },
          auto_return: "approved",
          notification_url: `${this.config.backendUrl}/api/webhooks/mercadopago`,
          statement_descriptor: "ECO Premium",
        },
      });

      if (!response.init_point || !response.id) {
        throw new Error("Invalid preference response from Mercado Pago");
      }

      logger.info("annual_preference_created", {
        userId,
        preferenceId: response.id,
      });

      return {
        initPoint: response.init_point,
        id: response.id,
        type: "preference",
      };
    } catch (error) {
      logger.error("create_annual_preference_failed", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Cancel a preapproval (monthly subscription)
   *
   * @param preapprovalId - Preapproval ID from Mercado Pago
   */
  async cancelPreapproval(preapprovalId: string): Promise<void> {
    try {
      const preApprovalClient = new PreApproval(this.client);

      await preApprovalClient.update({
        id: preapprovalId,
        body: {
          status: "cancelled",
        },
      });

      logger.info("preapproval_cancelled", { preapprovalId });
    } catch (error) {
      logger.error("cancel_preapproval_failed", {
        preapprovalId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get payment details from Mercado Pago
   *
   * @param paymentId - Payment ID from webhook
   * @returns Payment data
   */
  async getPayment(paymentId: string): Promise<any> {
    try {
      const paymentClient = new Payment(this.client);
      const payment = await paymentClient.get({ id: paymentId });

      logger.debug("payment_fetched", { paymentId, status: payment.status });

      return payment;
    } catch (error) {
      logger.error("get_payment_failed", {
        paymentId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get preapproval details from Mercado Pago
   *
   * @param preapprovalId - Preapproval ID from webhook
   * @returns Preapproval data
   */
  async getPreapproval(preapprovalId: string): Promise<any> {
    try {
      const preApprovalClient = new PreApproval(this.client);
      const preapproval = await preApprovalClient.get({ id: preapprovalId });

      logger.debug("preapproval_fetched", {
        preapprovalId,
        status: preapproval.status,
      });

      return preapproval;
    } catch (error) {
      logger.error("get_preapproval_failed", {
        preapprovalId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate webhook signature from Mercado Pago
   *
   * Implements the signature validation algorithm:
   * 1. Extract ts and v1 from x-signature header
   * 2. Build manifest: id:{data.id};request-id:{x-request-id};ts:{ts};
   * 3. Compute HMAC SHA256 with webhook secret
   * 4. Compare computed hash with provided v1
   *
   * @param headers - Request headers
   * @param body - Request body
   * @returns true if signature is valid, false otherwise
   */
  validateWebhookSignature(headers: WebhookHeaders, body: any): boolean {
    try {
      if (!this.config.webhookSecret) {
        logger.warn("webhook_secret_not_configured");
        return false;
      }

      const signature = headers["x-signature"];
      const requestId = headers["x-request-id"];

      if (!signature || !requestId) {
        logger.warn("missing_webhook_headers", { signature: !!signature, requestId: !!requestId });
        return false;
      }

      // Parse signature header: ts=123456789,v1=hash
      const parts = signature.split(",").reduce((acc, part) => {
        const [key, value] = part.split("=");
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);

      const ts = parts.ts;
      const v1 = parts.v1;

      if (!ts || !v1) {
        logger.warn("invalid_signature_format", { signature });
        return false;
      }

      // Build manifest
      const dataId = body?.data?.id || body?.id || "";
      const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;

      // Compute HMAC SHA256
      const hmac = crypto.createHmac("sha256", this.config.webhookSecret);
      hmac.update(manifest);
      const computedHash = hmac.digest("hex");

      // Compare hashes
      const isValid = computedHash === v1;

      if (!isValid) {
        logger.warn("webhook_signature_mismatch", {
          manifest,
          expected: v1,
          computed: computedHash,
        });
      }

      return isValid;
    } catch (error) {
      logger.error("webhook_validation_error", {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

/**
 * Singleton instance
 */
let mpServiceInstance: MercadoPagoService | null = null;

/**
 * Get or create MercadoPagoService singleton
 */
export function getMercadoPagoService(): MercadoPagoService {
  if (!mpServiceInstance) {
    mpServiceInstance = new MercadoPagoService();
  }
  return mpServiceInstance;
}
