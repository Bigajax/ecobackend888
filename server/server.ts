// C:\Users\Rafael\Desktop\eco5555\Eco666\server\server.ts

import express, { Express, Request, Response } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors'; // <-- Importe o CORS!
import openrouterRoutes from './routes/openrouterRoutes';
import promptRoutes from './routes/promptRoutes';
// import { analyzeSentiment, analyzeEmotions } from './services/googleCloudService'; // Comentado

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({ // <-- ADICIONE ISSO AQUI!
  origin: 'http://localhost:5173', // Permita o frontend Vite
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Rotas importadas de outros arquivos
app.use('/api', openrouterRoutes);
app.use('/api', promptRoutes);

// Rotas diretas no server.ts (comentadas)
// ...

app.listen(PORT, () => {
  console.log(`Servidor Express rodando na porta ${PORT}`);
});

export default app;