import { Router, Request, Response } from 'express';
// Importe a nova função do seu serviço OpenRouter
import { askOpenRouter } from '../services/openrouterService'; // Certifique-se de que o nome do arquivo de serviço corresponde

const router = Router();

/**
 * Rota para interação com a Eco via OpenRouter (usando ChatGPT 4.0 Omni).
 * Espera: messages (array), userName (string), userId (string)
 */
router.post('/ask-eco', async (req: Request, res: Response) => { // Rota renomeada para '/ask-eco'
  try {
    await askOpenRouter(req, res); // Chama a função do serviço OpenRouter
  } catch (error) {
    console.error('Erro no handler de rota /ask-eco:', error); // Log atualizado
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  }
});

export default router;
