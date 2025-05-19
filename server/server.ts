// server.ts
import express, { Express } from 'express';
import bodyParser from 'body-parser';
import { VercelRequest, VercelResponse } from '@vercel/node';
import openrouterRoutes from './routes/openrouterRoutes';
import promptRoutes from './routes/promptRoutes';
import { analyzeSentiment, analyzeEmotions } from './services/googleCloudService';

const app: Express = express();
app.use(bodyParser.json());
app.use('/api', openrouterRoutes);
app.use('/api', promptRoutes);

app.post('/api/analyze-sentiment', async (req: VercelRequest, res: VercelResponse) => { // Use Vercel types
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Por favor, forneça o texto para análise de sentimento.' });
    }
    const sentimentResult = await analyzeSentiment(text);
    res.json(sentimentResult);
  } catch (error: any) {
    console.error('Erro ao analisar sentimento:', error);
    res.status(500).json({ error: 'Erro ao analisar sentimento.' });
  }
});

app.post('/api/analyze-emotions', async (req: VercelRequest, res: VercelResponse) => { // Use Vercel types
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Por favor, forneça o texto para análise de emoções.' });
    }
    const emotionsResult = await analyzeEmotions(text);
    res.json(emotionsResult);
  } catch (error: any) {
    console.error('Erro ao analisar emoções:', error);
    res.status(500).json({ error: 'Erro ao analisar emoções.' });
  }
});

export default async (req: VercelRequest, res: VercelResponse) => {
  await app(req, res);
};