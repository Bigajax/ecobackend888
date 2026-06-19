import express from "express";
import { createSonoLead, createGateLead } from "../controllers/leadsController";
import { subscribeNewsletter } from "../controllers/newsletterController";

const router = express.Router();

/**
 * POST /api/leads/sono-noite1
 *
 * Captura de lead da landing do Protocolo Sono (Noite 1 grátis).
 * Rota PÚBLICA — sem requireAuth.
 */
router.post("/sono-noite1", createSonoLead);

/**
 * POST /api/leads/sono-gate
 *
 * Captura de lead do GATE de cadastro do /sono (antes da Noite 1), só e-mail.
 * Salva o lead ANTES de provisionar a conta para não perdê-lo se o cadastro
 * falhar. Rota PÚBLICA — sem requireAuth.
 */
router.post("/sono-gate", createGateLead);

/**
 * POST /api/leads/newsletter
 *
 * Inscrição na newsletter geral (footer "Fique por dentro").
 * Rota PÚBLICA — sem requireAuth.
 */
router.post("/newsletter", subscribeNewsletter);

export default router;
