import { Router, Request, Response } from 'express';
import { getEcoResponse } from '../services/getEcoResponse'; // 🟢 função correta agora

const router = Router();

/**
 * Rota para interação com a Eco via OpenRouter (usando ChatGPT 4.0 Omni).
 * Espera: messages (array), userName (string), userId (string)
 */
router.post('/ask-eco', async (req: Request, res: Response) => {
  try {
    const { messages, userName, userId } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0 || !userId) {
      return res.status(400).json({ error: 'Mensagens ou usuário não fornecidos.' });
    }

    const ecoText = await getEcoResponse({ messages, userName, userId });
    res.status(200).json({ message: ecoText });

  } catch (error) {
    console.error('[ask-eco] Erro interno:', error);
    res.status(500).json({ error: 'Erro ao gerar resposta da Eco.' });
  }
});

export default router;
