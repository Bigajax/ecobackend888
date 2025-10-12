import { Router, type Request, type Response, type NextFunction } from "express";
import requireAdmin from "../../mw/requireAdmin";
import { createMemoryController } from "./controller";
import { ensureCorsHeaders } from "../../core/http/middlewares/cors";

const router = Router();

router.use((req: Request, res: Response, next: NextFunction) => {
  ensureCorsHeaders(res, req.headers.origin as string | undefined);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  return next();
});

router.use(requireAdmin);
const controller = createMemoryController();

router.post("/registrar", controller.registerMemory);
router.get("/", controller.listMemories);
router.post("/similares", controller.findSimilar);

router.post("/similares_v2", controller.findSimilar);
router.post("/similar_v2", controller.findSimilar);

export default router;
