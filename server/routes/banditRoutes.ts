import express from "express";
import { upsertBanditArms } from "../controllers/banditArmsController";

const router = express.Router();

router.head("/arms", (_req, res) => res.status(204).end());
router.put("/arms", upsertBanditArms);

export default router;
