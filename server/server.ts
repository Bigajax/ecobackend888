// C:\Users\Rafael\Desktop\eco5555\Eco666\server\server.ts

import dotenv from 'dotenv'; // <<<< ADICIONE ESTA LINHA
dotenv.config(); // <<<< ADICIONE ESTA LINHA PARA CARREGAR AS VARIAVEIS DE AMBIENTE

import express, { Express, Request, Response } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import openrouterRoutes from './routes/openrouterRoutes';
import promptRoutes from './routes/promptRoutes';

const app: Express = express();
// A porta pode ser definida aqui, lendo de process.env ou usando um fallback
const PORT = process.env.PORT || 3001; 

// Middlewares
app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`Backend: Requisição recebida - Método: ${req.method}, URL: ${req.originalUrl}`);
  next();
});

app.use('/api', openrouterRoutes);
app.use('/api', promptRoutes);

app.listen(PORT, () => {
  console.log(`Servidor Express rodando na porta ${PORT}`);
});

export default app;