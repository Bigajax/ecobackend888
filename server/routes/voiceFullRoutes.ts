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
    const { nome_usuario, usuario_id, mensagens, access_token } = req.body;

    if (!audioFile || !nome_usuario || !access_token) {
      return res.status(400).json({ error: 'Áudio, nome do usuário e token são obrigatórios.' });
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
      userId: usuario_id || 'anon',
      accessToken: access_token
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

router.post('/ask-eco', async (req, res) => {
  const { usuario_id, mensagem, mensagens, nome_usuario, access_token } = req.body;

  if (!usuario_id || (!mensagem && !mensagens)) {
    return res.status(400).json({ error: "usuario_id e mensagens são obrigatórios." });
  }

  if (!access_token) {
    return res.status(401).json({ error: "Token de acesso ausente." });
  }

  try {
    const mensagensParaIA = mensagens || [{ role: "user", content: mensagem }];

    const resposta = await getEcoResponse({
      messages: mensagensParaIA,
      userId: usuario_id,
      userName: nome_usuario,
      accessToken: access_token
    });

    return res.status(200).json({ message: resposta.message });

  } catch (err: any) {
    console.error("❌ Erro no /ask-eco:", err.message || err);
    return res.status(500).json({ error: "Erro interno ao processar a requisição." });
  }
});

export default router;
