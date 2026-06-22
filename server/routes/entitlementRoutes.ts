import express from "express";
import { checkEntitlement, checkEntitlementByGuest, claimEntitlement } from "../controllers/entitlementController";
import { requireAuth } from "../middleware/requireAuth";

const router = express.Router();

/**
 * GET /api/entitlements/check?product_key=protocolo_sono_7_noites
 * Verifica acesso ativo do usuário a um produto. Requer auth.
 */
router.get("/check", requireAuth, checkEntitlement);

/**
 * GET /api/entitlements/check-guest?product_key=...&guest_id=...
 * Verifica acesso por guest_id (pagou via Pix antes de criar conta). Público.
 */
router.get("/check-guest", checkEntitlementByGuest);

/**
 * POST /api/entitlements/claim
 * Vincula entitlement ao usuário autenticado. Requer auth.
 */
router.post("/claim", requireAuth, claimEntitlement);

export default router;
