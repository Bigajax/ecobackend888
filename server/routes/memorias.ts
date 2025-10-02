// server/routes/memorias.ts
import { Router } from "express";
import { registrarMemoriaHandler } from "../controllers/memoriasController";

const router = Router();
router.post("/registrar", registrarMemoriaHandler);
export default router;
