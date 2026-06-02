import express from "express";
import { mercadoPagoWebhookHandler } from "../controllers/webhookController";

const router = express.Router();

/**
 * Webhook routes
 *
 * IMPORTANT: These routes are PUBLIC (no authentication required)
 * Signature validation is performed inside the handler
 */

/**
 * POST /api/webhooks/mercadopago
 * Mercado Pago webhook endpoint
 *
 * Receives payment and subscription events from Mercado Pago
 * Always returns 200 OK (idempotent processing)
 */
router.post("/mercadopago", mercadoPagoWebhookHandler);

export default router;
