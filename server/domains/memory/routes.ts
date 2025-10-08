import { Router } from "express";
import requireAdmin from "../../mw/requireAdmin";
import { createMemoryController } from "./controller";

const router = Router();
router.use(requireAdmin);
const controller = createMemoryController();

router.post("/registrar", controller.registerMemory);
router.get("/", controller.listMemories);
router.post("/similares", controller.findSimilar);

router.post("/similares_v2", controller.findSimilar);
router.post("/similar_v2", controller.findSimilar);

export default router;
