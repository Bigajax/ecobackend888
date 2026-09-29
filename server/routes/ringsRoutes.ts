/**
 * Cinco Anéis. Todas as rotas exigem login.
 */
import express from "express";
import { requireAuth } from "../middleware/requireAuth";
import * as rings from "../controllers/ringsController";

const router = express.Router();
router.use(requireAuth);

router.post("/dia", rings.salvarDia);
router.get("/history", rings.historico);
router.post("/migrate", rings.migrar);

export default router;
