import express from 'express';
import multer from 'multer';
import { generateAudio } from '../services/elevenlabsService';
import { getEcoResponse } from '../services/ecoCortex';
import { transcribeWithWhisper } from '../scripts/transcribe';

const router = express.Router();
const upload = multer();

router.post('/transcribe-and-respond', upload.single('audio'), async (req, res) => {
  try {
    const audioFile = req.file;
    const { nome_usuario, usuario_id, mensagens } = req.body;

    if (!audioFile || !nome_usuario) {
      return res.status(400).json({ error: 'Áudio e nome do usuário são obrigatórios.' });
    }

    // 1. Transcreve o áudio
    const userText = await transcribeWithWhisper(audioFile.buffer);
    console.log('[Transcrição Whisper]', userText);

    // 2. Constrói histórico para a IA
    const mensagensFormatadas = mensagens
      ? JSON.parse(mensagens)
      : [{ id: `voice-${Date.now()}`, role: 'user', content: userText }];

    // 3. Gera resposta da IA
    const ecoResponse = await getEcoResponse({
      messages: mensagensFormatadas,
      userName: nome_usuario,
      userId: usuario_id || 'anon'
    });
    console.log('[Resposta da IA]', ecoResponse);

    // 4. Gera o áudio da resposta
    const audioBuffer = await generateAudio(ecoResponse.message);

    // 5. Retorna os dados
    res.json({
      userText,
      ecoText: ecoResponse.message,
      audioBase64: audioBuffer.toString('base64'),
    });

  } catch (err: any) {
    console.error('[Erro no fluxo de voz]', err);
    res.status(500).json({ error: 'Erro no fluxo de voz completo' });
  }
});

export default router;
