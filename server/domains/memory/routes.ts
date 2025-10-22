import { Router } from "express";
import requireAdmin from "../../mw/requireAdmin";
import { createMemoryController } from "./controller";

const router = Router();

router.use(requireAdmin);
export const memoryController = createMemoryController();

router.post("/registrar", memoryController.registerMemory);
router.get("/", memoryController.listMemories);
router.post("/similares", memoryController.findSimilar);

router.get("/similares_v2", memoryController.findSimilarV2);
router.post("/similares_v2", memoryController.findSimilar);
router.post("/similar_v2", memoryController.findSimilar);

export default router;
