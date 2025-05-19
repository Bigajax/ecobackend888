import express from 'express';
import { handleAskEco } from '../controllers/openrouterController';

const router = express.Router();

router.post('/ask-eco', handleAskEco);

export default router;