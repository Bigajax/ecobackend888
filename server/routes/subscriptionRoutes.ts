import express from "express";
import {
  createPreferenceHandler,
  getStatusHandler,
  cancelHandler,
  reactivateHandler,
  getInvoicesHandler,
} from "../controllers/subscriptionController";
import { requireAuth } from "../middleware/requireAuth";

const router = express.Router();

/**
 * Subscription routes
 *
 * All routes require authentication via JWT (Authorization: Bearer <token>)
 */

/**
 * POST /api/subscription/create-preference
 * Create Mercado Pago checkout for subscription
 *
 * Body: { plan: 'monthly' | 'annual' }
 * Returns: { initPoint: string, id: string, type: string }
 */
router.post("/create-preference", requireAuth, createPreferenceHandler);

/**
 * GET /api/subscription/status
 * Get current subscription status
 *
 * Returns: SubscriptionStatusResponse
 */
router.get("/status", requireAuth, getStatusHandler);

/**
 * POST /api/subscription/cancel
 * Cancel subscription (keeps access until period end)
 *
 * Body: { reason?: string }
 * Returns: { message: string, accessUntil: string }
 */
router.post("/cancel", requireAuth, cancelHandler);

/**
 * POST /api/subscription/reactivate
 * Reactivate cancelled monthly subscription
 *
 * Returns: { message: string, status: SubscriptionStatusResponse }
 */
router.post("/reactivate", requireAuth, reactivateHandler);

/**
 * GET /api/subscription/invoices
 * Get payment history
 *
 * Query: { limit?: number }
 * Returns: { payments: Payment[] }
 */
router.get("/invoices", requireAuth, getInvoicesHandler);

export default router;
