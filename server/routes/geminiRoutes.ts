import { Router, Request, Response } from 'express';
import { askGemini } from '../services/geminiService';

const router = Router();

/**
 * Rota para interação com a Eco via Google Gemini.
 * Agora espera também: messages (array), userName (string), userId (string)
 */
router.post('/ask-gemini', async (req: Request, res: Response) => {
  try {
    await askGemini(req, res);
  } catch (error) {
    console.error('Erro no handler de rota /ask-gemini:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  }
});

export default router;
