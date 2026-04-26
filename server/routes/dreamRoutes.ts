import { Router } from "express";
import { interpretDreamHandler, getDreamHistoryHandler } from "../controllers/dreamController";

const router = Router();

router.post("/interpret", interpretDreamHandler);
router.get("/history", getDreamHistoryHandler);

export default router;
