import express from 'express';
import multer from 'multer';
import { generateAudio } from '../services/elevenlabsService'; // ✅ Corrigido
import { getEcoResponse } from '../services/getEcoResponse';
import { transcribeWithWhisper } from '../scripts/transcribe';

const router = express.Router();
const upload = multer();

router.post('/transcribe-and-respond', upload.single('audio'), async (req, res) => {
  try {
    const audioFile = req.file;
    const { userName, userId } = req.body;

    if (!audioFile || !userName || !userId) {
      return res.status(400).json({ error: 'Áudio, nome e ID do usuário são obrigatórios.' });
    }

    // 1. Transcreve o áudio
    const userText = await transcribeWithWhisper(audioFile.buffer);
    console.log('[Transcrição Whisper]', userText);

    // 2. Chama a IA
    const ecoText = await getEcoResponse({
      messages: [{ id: `voice-${Date.now()}`, role: 'user', content: userText }],
      userName,
      userId
    });

    // 3. Gera o áudio de resposta
    const audioBuffer = await generateAudio(ecoText);

    // 4. Retorna o JSON com áudio em base64
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
