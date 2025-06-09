// ✅ voiceTTSRoutes.ts (rota usada no botão de som do chat)
import express from 'express';
import { generateAudio } from '../services/elevenlabsService'; // Import correto da função

const router = express.Router();

router.post('/tts', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Texto não fornecido' });

    // Chamada correta da função
    const audioBuffer = await generateAudio(text);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(audioBuffer);
  } catch (err: any) {
    console.error('[TTS Error]', err);
    res.status(500).json({ error: 'Erro ao gerar áudio' });
  }
});

export default router;
