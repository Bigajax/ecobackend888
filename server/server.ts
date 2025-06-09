// server.ts ✅ Corrigido
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';

import promptRoutes from './routes/promptRoutes';
import memoryRoutes from './routes/memoryRoutes';
import profileRoutes from './routes/profileRoutes';
import voiceTTSRoutes from './routes/voiceTTSRoutes';     // Chat: texto → voz
import voiceFullRoutes from './routes/voiceFullRoutes';   // Página voz: gravação → transcrição → IA → voz
import openrouterRoutes from './routes/openrouterRoutes'; // ✅ Corrigido: rota para ask-eco

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`Backend: [${req.method}] ${req.originalUrl}`);
  next();
});

// ✅ Rotas organizadas
app.use('/api', promptRoutes);
app.use('/api', memoryRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/voice', voiceTTSRoutes);      // POST /api/voice/tts
app.use('/api/voice', voiceFullRoutes);     // POST /api/voice/transcribe-and-respond
app.use('/api', openrouterRoutes);          // ✅ POST /api/ask-eco

app.listen(PORT, () => {
  console.log(`Servidor Express rodando na porta ${PORT}`);
});

export default app;
