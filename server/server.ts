// server/server.ts
import dotenv from 'dotenv';
dotenv.config();

import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import geminiRoutes from './routes/geminiRoutes';

const app: Express = express();
const PORT = process.env.PORT || 3001; 

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`Backend: Requisição recebida - Método: ${req.method}, URL: ${req.originalUrl}`);
  next();
});

app.use('/api', geminiRoutes);

// Adicione esta lógica para iniciar o servidor apenas se não estiver no ambiente Vercel
if (process.env.NODE_ENV !== 'production') { // Ou uma variável VERCEL_ENV
  app.listen(PORT, () => {
    console.log(`Servidor Express rodando na porta ${PORT} para desenvolvimento`);
  });
}

export default app;