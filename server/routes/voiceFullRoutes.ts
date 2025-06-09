import express from 'express';
import multer from 'multer';
import { generateAudio } from '../services/elevenlabsService';
import { getEcoResponse } from '../services/getEcoResponse';
import { transcribeWithWhisper } from '../scripts/transcribe';

const router = express.Router();
const upload = multer();

router.post('/transcribe-and-respond', upload.single('audio'), async (req, res) => {
  try {
    const audioFile = req.file;
    const { userName, userId } = req.body;

    if (!audioFile || !userName) {
      return res.status(400).json({ error: 'Áudio e nome do usuário são obrigatórios.' });
    }

    // 1. Transcreve o áudio
    const userText = await transcribeWithWhisper(audioFile.buffer);
    console.log('[Transcrição Whisper]', userText);

    // 2. Chama a IA com getEcoResponse
    const ecoText = await getEcoResponse({
      messages: [
        { id: `voice-${Date.now()}`, role: 'user', content: userText }
      ],
      userName,
      userId: userId || 'anon' // Garante que funcione mesmo sem userId
    });
    console.log('[Resposta da IA]', ecoText);

    // 3. Gera o áudio da resposta
    const audioBuffer = await generateAudio(ecoText);

    // 4. Retorna os dados
    res.json({
      userText,
      ecoText,
      audioBase64: audioBuffer.toString('base64'),
    });

  } catch (err: any) {
    console.error('[Erro no fluxo de voz]', err);
    res.status(500).json({ error: 'Erro no fluxo de voz completo' });
  }
});

export default router;
