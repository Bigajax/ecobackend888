import express, { Express, Request, Response } from 'express';
import bodyParser from 'body-parser';
import openrouterRoutes from './routes/openrouterRoutes';
import promptRoutes from './routes/promptRoutes';
// import { analyzeSentiment, analyzeEmotions } from './services/googleCloudService'; // COMENTE ESTA LINHA

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Rotas importadas de outros arquivos
app.use('/api', openrouterRoutes);
app.use('/api', promptRoutes);

// Rotas diretas no server.ts (COMENTE-AS TEMPORARIAMENTE TAMBÉM)
// app.post('/api/analyze-sentiment', async (req: Request, res: Response) => {
//   try {
//     const { text } = req.body;
//     if (!text) {
//       return res.status(400).json({ error: 'Por favor, forneça o texto para análise de sentimento.' });
//     }
//     // const sentimentResult = await analyzeSentiment(text); // Comente esta chamada
//     // return res.json(sentimentResult);
//     return res.status(200).json({ message: 'Análise de sentimento temporariamente desabilitada.' });
//   } catch (error: any) {
//     console.error('Erro ao analisar sentimento:', error);
//     return res.status(500).json({ error: 'Erro ao analisar sentimento.' });
//   }
// });

// app.post('/api/analyze-emotions', async (req: Request, res: Response) => {
//   try {
//     const { text } = req.body;
//     if (!text) {
//       return res.status(400).json({ error: 'Por favor, forneça o texto para análise de emoções.' });
//     }
//     // const emotionsResult = await analyzeEmotions(text); // Comente esta chamada
//     // return res.json(emotionsResult);
//     return res.status(200).json({ message: 'Análise de emoções temporariamente desabilitada.' });
//   } catch (error: any) {
//     console.error('Erro ao analisar emoções:', error);
//     return res.status(500).json({ error: 'Erro ao analisar emoções.' });
//   }
// });

app.listen(PORT, () => {
  console.log(`Servidor Express rodando na porta ${PORT}`);
});

export default app;