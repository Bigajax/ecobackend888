import express from 'express';
import { handleAskEco } from '../controllers/openrouterController';
import { VercelRequest, VercelResponse } from '@vercel/node'; // Import Vercel types

const router = express.Router();

router.post('/ask-eco', async (req: VercelRequest, res: VercelResponse) => { // Use Vercel types
  await handleAskEco(req, res);
});

export default router;