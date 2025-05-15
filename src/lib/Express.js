// lib/Express.js
const express = require('express');
const bodyParser = require('body-parser');
const { analyzeSentiment, analyzeEmotions } = require('./googleCloudService'); // Importe o serviço do arquivo correto

const app = express();
const port = process.env.PORT || 5000;

app.use(bodyParser.json());

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