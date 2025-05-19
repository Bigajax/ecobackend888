import express from 'express';
import { handleAskEco } from '../controllers/openrouterController';
import { VercelRequest, VercelResponse } from '@vercel/node';

const router = express.Router();

router.post('/ask-eco', async (req: VercelRequest, res: VercelResponse) => {
  await handleAskEco(req, res);
});

export default router;