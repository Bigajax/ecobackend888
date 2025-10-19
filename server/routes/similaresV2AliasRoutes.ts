import { Router } from "express";

import requireAdmin from "../mw/requireAdmin";
import { createMemoryController } from "../domains/memory/controller";

const router = Router();
const controller = createMemoryController();

router.use(requireAdmin);
router.get("/", controller.findSimilarV2);

export default router;
