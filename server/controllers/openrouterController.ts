import { Request, Response } from 'express'; // Import Express types AQUI
import { askOpenRouter } from '../services/openrouter';

export const handleAskEco = async (req: Request, res: Response) => { // Use Express types AQUI
  try {
    const userMessages = req.body.messages;
    const userName = req.body.userName;

    if (!userMessages || !Array.isArray(userMessages)) {
      return res.status(400).json({ error: 'Por favor, forneça um array de mensagens.' });
    }

    const response = await askOpenRouter(userMessages, userName);
    res.json({ response });
  } catch (error: any) {
    console.error('Erro ao processar requisição da OpenRouter:', error);
    res.status(500).json({ error: 'Erro ao comunicar com a OpenRouter.' });
  }
};