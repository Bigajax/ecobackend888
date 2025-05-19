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
  // ... sua lógica
});

app.post('/api/analyze-emotions', async (req: VercelRequest, res: VercelResponse) => { // Use Vercel types
  // ... sua lógica
});

export default async (req: VercelRequest, res: VercelResponse) => {
  await app(req, res);
};