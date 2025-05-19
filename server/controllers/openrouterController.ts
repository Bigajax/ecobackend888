import { Request, Response } from 'express';
import { askOpenRouter } from '../services/openrouterService';

export const handleAskEco = async (req: Request, res: Response) => {
  try {
    const userMessages = req.body.messages; // Assumindo que o front-end enviará um array de mensagens no corpo da requisição
    const userName = req.body.userName; // Assumindo que o front-end pode enviar o nome do usuário

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