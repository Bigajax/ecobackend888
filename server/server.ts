import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';

import promptRoutes from './routes/promptRoutes';
import memoryRoutes from './routes/memoryRoutes';         // Rotas de /api/memorias
import profileRoutes from './routes/profileRoutes';
import voiceTTSRoutes from './routes/voiceTTSRoutes';     // POST /api/voice/tts
import voiceFullRoutes from './routes/voiceFullRoutes';   // POST /api/voice/transcribe-and-respond
import openrouterRoutes from './routes/openrouterRoutes'; // POST /api/ask-eco

const app = express();
const PORT = process.env.PORT || 3001;

// Configuração do CORS
app.use(cors({
  origin: 'http://localhost:5173', // ajuste se necessário para produção
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Parsing de body JSON e URL-encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware de log
app.use((req, res, next) => {
  console.log(`Backend: [${req.method}] ${req.originalUrl}`);
  next();
});

// ✅ Registro das rotas
app.use('/api', promptRoutes);
app.use('/api/memorias', memoryRoutes);     // ex: GET /api/memorias?usuario_id=abc
app.use('/api/profiles', profileRoutes);
app.use('/api/voice', voiceTTSRoutes);      // ex: POST /api/voice/tts
app.use('/api/voice', voiceFullRoutes);     // ex: POST /api/voice/transcribe-and-respond
app.use('/api', openrouterRoutes);          // ex: POST /api/ask-eco

// Inicialização do servidor
app.listen(PORT, () => {
  console.log(`Servidor Express rodando na porta ${PORT}`);
});

export default app;
