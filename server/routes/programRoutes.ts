import express from "express";
import { requireAuth } from "../middleware/requireAuth";
import * as programsController from "../controllers/programsController";

const router = express.Router();

/**
 * All program routes require authentication
 */
router.use(requireAuth);

/**
 * POST /api/programs/start
 * Start a new program or resume existing enrollment
 */
router.post("/start", programsController.startProgram);

/**
 * GET /api/programs/user/history
 * Get user's enrollment history
 * Note: This must come before /:enrollmentId to avoid route conflicts
 */
router.get("/user/history", programsController.getUserHistory);

/**
 * GET /api/programs/:enrollmentId
 * Get enrollment details with answers
 */
router.get("/:enrollmentId", programsController.getEnrollment);

/**
 * PUT /api/programs/:enrollmentId/progress
 * Update program progress
 */
router.put("/:enrollmentId/progress", programsController.updateProgress);

/**
 * POST /api/programs/:enrollmentId/answers
 * Save step answers (auto-save)
 */
router.post("/:enrollmentId/answers", programsController.saveAnswers);

/**
 * POST /api/programs/:enrollmentId/complete
 * Mark program as completed
 */
router.post("/:enrollmentId/complete", programsController.completeProgram);

/**
 * POST /api/programs/:enrollmentId/abandon
 * Mark program as abandoned
 */
router.post("/:enrollmentId/abandon", programsController.abandonProgram);

export default router;
