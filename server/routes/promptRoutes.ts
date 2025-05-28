// server/routes/promptRoutes.ts

import { Router, Request, Response } from 'express';
import { getPromptMestre } from '../controllers/promptController';

const router = Router();

console.log('Backend: promptRoutes carregado.');

/**
 * GET /api/prompt-mestre
 * Retorna o prompt mestre já montado e em cache.
 */
router.get(
  '/prompt-mestre',
  async (req: Request, res: Response) => {
    try {
      await getPromptMestre(req, res);
    } catch (error) {
      console.error('Erro no handler de rota /prompt-mestre:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Erro interno ao obter o prompt mestre.' });
      }
    }
  }
);

export default router;
