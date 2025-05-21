// C:\Users\Rafael\Desktop\eco5555\Eco666\server\server.ts

import dotenv from 'dotenv';
dotenv.config(); // Carrega as variáveis de ambiente do .env

import express, { Express, Request, Response } from 'express';
// import bodyParser from 'body-parser'; // REMOVIDO: express.json() já faz isso
import cors from 'cors';
// import openrouterRoutes from './routes/openrouterRoutes'; // REMOVIDO: Focando no Gemini
// import promptRoutes from './routes/promptRoutes';     // REMOVIDO: Prompt agora é interno ao geminiService
import geminiRoutes from './routes/geminiRoutes';       // ADICIONADO: Rota para o Gemini

const app: Express = express();
const PORT = process.env.PORT || 3001; 

// Middlewares
app.use(cors({
  origin: 'http://localhost:5173', // Permite requisições apenas do seu frontend Vite
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Substitui bodyParser.json() e bodyParser.urlencoded()
app.use(express.json()); // Habilita o Express a parsear JSON no corpo das requisições
app.use(express.urlencoded({ extended: true })); // Habilita o Express a parsear dados de formulário URL-encoded

// Middleware para logar todas as requisições recebidas pelo backend
app.use((req, res, next) => {
  console.log(`Backend: Requisição recebida - Método: ${req.method}, URL: ${req.originalUrl}`);
  next(); // Continua para a próxima middleware/rota
});

// Usa a rota para as requisições da API Gemini
app.use('/api', geminiRoutes);

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor Express rodando na porta ${PORT}`);
});

export default app;