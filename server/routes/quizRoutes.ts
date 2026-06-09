import express from "express";
import { saveQuizResponse, markQuizConverted, linkUserToQuizResponse } from "../controllers/quizController";
import { requireAuth } from "../middleware/requireAuth";

const router = express.Router();

// POST /api/quiz/response  (público — guests podem responder)
router.post("/response", saveQuizResponse);

// PATCH /api/quiz/response/:id/convert  (público — tracking de conversão)
router.patch("/response/:id/convert", markQuizConverted);

// PATCH /api/quiz/response/:id/link-user  (autenticado — vincula ao user)
router.patch("/response/:id/link-user", requireAuth, linkUserToQuizResponse);

export default router;
