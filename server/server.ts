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

app.post('/api/analyze-sentiment', async (req: VercelRequest, res: VercelResponse) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Texto não fornecido.' });
  }
  try {
    const sentiment = await analyzeSentiment(text);
    res.json(sentiment);
  } catch (error) {
    console.error('Erro na rota /api/analyze-sentiment:', error);
    res.status(500).json({ error: 'Erro ao analisar o sentimento.' });
  }
});

app.post('/api/analyze-emotions', async (req: VercelRequest, res: VercelResponse) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Texto não fornecido.' });
  }
  try {
    const emotions = await analyzeEmotions(text);
    res.json(emotions);
  } catch (error) {
    console.error('Erro na rota /api/analyze-emotions:', error);
    res.status(500).json({ error: 'Erro ao analisar as emoções.' });
  }
});

export default async (req: VercelRequest, res: VercelResponse) => {
  await app(req, res);
};