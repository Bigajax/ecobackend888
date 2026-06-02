import express from "express";
import { createProductPreference } from "../controllers/productCheckoutController";

const router = express.Router();

/**
 * POST /api/mp/create-preference
 *
 * Cria preferência MP para produto avulso.
 * Rota PÚBLICA — sem requireAuth.
 */
router.post("/create-preference", createProductPreference);

export default router;
