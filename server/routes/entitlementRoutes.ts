import express from "express";
import { checkEntitlement, claimEntitlement } from "../controllers/entitlementController";
import { requireAuth } from "../middleware/requireAuth";

const router = express.Router();

/**
 * GET /api/entitlements/check?product_key=protocolo_sono_7_noites
 * Verifica acesso ativo do usuário a um produto. Requer auth.
 */
router.get("/check", requireAuth, checkEntitlement);

/**
 * POST /api/entitlements/claim
 * Vincula entitlement ao usuário autenticado. Requer auth.
 */
router.post("/claim", requireAuth, claimEntitlement);

export default router;
