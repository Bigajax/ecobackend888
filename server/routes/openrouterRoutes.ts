import express, { Request, Response, Router } from 'express'; // Importe Router, Request e Response do 'express'
// REMOVA OU COMENTE a linha abaixo. Você não precisa dos tipos Vercel aqui.
// import { VercelRequest, VercelResponse } from '@vercel/node';

import { handleAskEco } from '../controllers/openrouterController'; // Certifique-se que o caminho está correto

const router = express.Router();

// Altere os tipos dos parâmetros 'req' e 'res' para Request e Response do Express
router.post('/ask-eco', async (req: Request, res: Response) => {
  // O 'handleAskEco' também precisa estar esperando Request e Response
  // Se 'handleAskEco' ainda espera VercelRequest/VercelResponse,
  // você DEVE mudar a assinatura dele também.
  // Por enquanto, vou assumir que você também vai ajustá-lo.
  await handleAskEco(req, res);
});

export default router;