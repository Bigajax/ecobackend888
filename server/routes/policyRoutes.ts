import express from "express";
import { upsertPolicyConfig } from "../controllers/policyController";

const router = express.Router();

router.head("/", (_req, res) => res.status(204).end());
router.put("/", upsertPolicyConfig);

export default router;
