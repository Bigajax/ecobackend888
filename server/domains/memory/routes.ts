import { Router } from "express";
import { createMemoryController } from "./controller";

const router = Router();
const controller = createMemoryController();

router.post("/registrar", controller.registerMemory);
router.get("/", controller.listMemories);
router.post("/similares", controller.findSimilar);

export default router;
