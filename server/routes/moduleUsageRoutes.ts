import express from "express";
import { registrarModuleUsage } from "../controllers/moduleUsageController";

const router = express.Router();

router.head("/", (_req, res) => res.status(204).end());
router.post("/", registrarModuleUsage);

export default router;
