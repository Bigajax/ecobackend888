// server/routes/memorias.ts
import { Router } from "express";
import { registrarMemoriaHandler } from "../controllers/memoriasController";
import requireAdmin from "../mw/requireAdmin";

const router = Router();
router.post("/registrar", requireAdmin, registrarMemoriaHandler);
export default router;
