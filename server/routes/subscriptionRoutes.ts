import express from "express";
import {
  createWithCardHandler,
  getStatusHandler,
  cancelHandler,
  reactivateHandler,
} from "../controllers/subscriptionController";
import { requireAuth } from "../middleware/requireAuth";

const router = express.Router();

/**
 * Subscription routes
 *
 * All routes require authentication via JWT (Authorization: Bearer <token>)
 */

/**
 * POST /api/subscription/create-with-card
 * Start a monthly trial subscription using a card token (transparent).
 * Body: MP CardPayment formData ({ token, ... }). Returns: { id, status }.
 */
router.post("/create-with-card", requireAuth, createWithCardHandler);

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

export default router;
