import express from "express";
import { saveQuizResponse, markQuizConverted } from "../controllers/quizController";

const router = express.Router();

// POST /api/quiz/response
router.post("/response", saveQuizResponse);

// PATCH /api/quiz/response/:id/convert
router.patch("/response/:id/convert", markQuizConverted);

export default router;
