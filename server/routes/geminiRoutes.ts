// C:\Users\Rafael\Desktop\eco5555\Eco666\server\routes\geminiRoutes.ts

import express from 'express';
import { askGemini } from '../services/geminiService'; // Certifique-se de que o caminho está correto

const router = express.Router();

// AQUI ESTÁ A CORREÇÃO:
// O segundo argumento de router.post deve ser a função de middleware.
// Você estava passando a declaração da rota inteira, em vez da função `askGemini`.
// Se `askGemini` é uma função assíncrona que lida com req e res, basta passá-la diretamente.
router.post('/ask-gemini', askGemini);

export default router;