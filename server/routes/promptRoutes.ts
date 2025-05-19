import express from 'express';
import { getPromptMestre } from '../controllers/promptController';

const router = express.Router();

router.get('/prompt-mestre', getPromptMestre);

export default router;