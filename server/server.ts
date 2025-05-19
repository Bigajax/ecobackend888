import express from 'express';
import bodyParser from 'body-parser';
import openrouterRoutes from './routes/openrouterRoutes'; // Importe as rotas da OpenRouter
import promptRoutes from './routes/promptRoutes'; // Importe as rotas para obter o prompt mestre
import { analyzeSentiment, analyzeEmotions } from './services/googleCloudService'; // Importe o serviço do Google Cloud

const app = express();
const port = process.env.PORT || 5000;

app.use(bodyParser.json());

// Use as rotas da OpenRouter para comunicação com a OpenRouter
app.use('/api', openrouterRoutes);

// Use as rotas para obter o prompt mestre do backend
app.use('/api', promptRoutes);

// Rotas para análise de sentimento e emoções (Google Cloud)
app.post('/api/analyze-sentiment', async (req, res) => {
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

app.post('/api/analyze-emotions', async (req, res) => {
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

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});