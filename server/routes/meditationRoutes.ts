import express from "express";
import { submitMeditationFeedback } from "../controllers/meditationFeedbackController";

const router = express.Router();

// POST /api/meditation/feedback - Submit meditation session feedback
router.post("/feedback", submitMeditationFeedback);

export default router;
