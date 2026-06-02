/**
 * Routes for Five Rings API
 * All routes require authentication via requireAuth middleware
 */

import express from "express";
import { requireAuth } from "../middleware/requireAuth";
import * as ringsController from "../controllers/ringsController";

const router = express.Router();

/**
 * All rings routes require authentication
 */
router.use(requireAuth);

/**
 * POST /api/rings/start
 * Start a new daily ritual or resume existing one
 */
router.post("/start", ringsController.startRitual);

/**
 * POST /api/rings/migrate
 * Migrate rituals from localStorage to backend
 * Note: This must come before /:ritualId to avoid route conflicts
 */
router.post("/migrate", ringsController.migrateFromLocalStorage);

/**
 * GET /api/rings/history
 * Get ritual history with filters and pagination
 * Note: This must come before /:ritualId to avoid route conflicts
 */
router.get("/history", ringsController.getRitualHistory);

/**
 * GET /api/rings/progress
 * Get user progress and statistics
 * Note: This must come before /:ritualId to avoid route conflicts
 */
router.get("/progress", ringsController.getProgress);

/**
 * GET /api/rings/ritual/:ritualId
 * Get ritual details with all answers
 */
router.get("/ritual/:ritualId", ringsController.getRitualDetails);

/**
 * POST /api/rings/:ritualId/answer
 * Save or update a ring answer
 */
router.post("/:ritualId/answer", ringsController.saveRingAnswer);

/**
 * POST /api/rings/:ritualId/complete
 * Mark ritual as completed
 */
router.post("/:ritualId/complete", ringsController.completeRitual);

/**
 * POST /api/rings/:ritualId/abandon
 * Mark ritual as abandoned
 */
router.post("/:ritualId/abandon", ringsController.abandonRitual);

export default router;
