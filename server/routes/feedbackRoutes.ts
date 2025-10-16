import express from "express";
import { registrarFeedback } from "../controllers/feedbackController";

const router = express.Router();

router.post("/", registrarFeedback);

export default router;
