import express from "express";
import { createSonoLead } from "../controllers/leadsController";

const router = express.Router();

/**
 * POST /api/leads/sono-noite1
 *
 * Captura de lead da landing do Protocolo Sono (Noite 1 grátis).
 * Rota PÚBLICA — sem requireAuth.
 */
router.post("/sono-noite1", createSonoLead);

export default router;
