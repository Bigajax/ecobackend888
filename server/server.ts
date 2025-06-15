import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';

import promptRoutes from './routes/promptRoutes';         // GET /api/prompt-preview
import memoryRoutes from './routes/memoryRoutes';         // GET/POST /api/memorias
import profileRoutes from './routes/perfilEmocionalRoutes';       // GET /api/profiles/:userId
import voiceTTSRoutes from './routes/voiceTTSRoutes';     // POST /api/voice/tts
import voiceFullRoutes from './routes/voiceFullRoutes';   // POST /api/voice/transcribe-and-respond
import openrouterRoutes from './routes/openrouterRoutes'; // POST /api/ask-eco

const app = express();
const PORT = process.env.PORT || 3001;

// 🔐 Configuração de CORS
app.use(cors({
  origin: 'http://localhost:5173', // Altere para domínio de produção se necessário
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 📦 Parsing de body JSON e formulário
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🧾 Middleware de log
app.use((req, res, next) => {
  console.log(`Backend: [${req.method}] ${req.originalUrl}`);
  next();
});

// ✅ Registro das rotas
app.use('/api', promptRoutes);              // GET /api/prompt-preview
app.use('/api/memorias', memoryRoutes);     // GET/POST /api/memorias
app.use('/api/profiles', profileRoutes);    // GET /api/profiles/:userId
app.use('/api/voice', voiceTTSRoutes);      // POST /api/voice/tts
app.use('/api/voice', voiceFullRoutes);     // POST /api/voice/transcribe-and-respond
app.use('/api', openrouterRoutes);          // POST /api/ask-eco

// 🚀 Inicialização do servidor
app.listen(PORT, () => {
  console.log(`Servidor Express rodando na porta ${PORT}`);
});

export default app;
