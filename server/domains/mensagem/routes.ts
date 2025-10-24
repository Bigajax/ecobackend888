import { Router } from "express";

import requireAdmin from "../../mw/requireAdmin";
import { createMensagemController } from "./controller";

const router = Router();
const mensagemController = createMensagemController();

router.use(requireAdmin);

router.post("/registrar", mensagemController.registrar);
router.get("/", mensagemController.listar);

export default router;
