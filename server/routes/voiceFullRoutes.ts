import express from "express";
import multer from "multer";
import { generateAudio } from "../services/elevenlabsService";
import { getEcoResponse } from "../services/ecoCortex";
import { transcribeWithWhisper } from "../scripts/transcribe";

const router = express.Router();
const upload = multer();

/**
 * POST /transcribe-and-respond
 * Body/form-data: { audio(file), nome_usuario?, usuario_id?, mensagens?(JSON), access_token, voice_id? }
 */
router.post("/transcribe-and-respond", upload.single("audio"), async (req, res) => {
  try {
    const audioFile = req.file;
    const { nome_usuario, usuario_id, mensagens, access_token, voice_id } = req.body;

    if (!audioFile || !access_token) {
      return res.status(400).json({ error: "Áudio e token são obrigatórios." });
    }

    console.log("📥 Dados recebidos:", {
      nome_usuario,
      usuario_id,
      audioMime: audioFile.mimetype,
      audioSize: audioFile.size,
    });

    // 1) Transcreve
    console.log("📝 Iniciando transcrição...");
    const userText = await transcribeWithWhisper(audioFile.buffer);
    console.log("[✅ Transcrição Whisper]", userText);

    if (!userText || typeof userText !== "string" || userText.trim().length === 0) {
      return res.status(422).json({ error: "Transcrição vazia. Tente novamente." });
    }

    // 2) Histórico p/ IA
    let mensagensFormatadas: any[];
    try {
      const parsed = mensagens ? JSON.parse(mensagens) : [];
      mensagensFormatadas =
        Array.isArray(parsed) && parsed.length > 0
          ? parsed
          : [{ id: `voice-${Date.now()}`, role: "user", content: userText }];
    } catch {
      mensagensFormatadas = [{ id: `voice-${Date.now()}`, role: "user", content: userText }];
    }
    console.log("🧠 Histórico para IA:", mensagensFormatadas);

    // 3) Resposta da IA
    console.log("🤖 Chamando getEcoResponse...");
    const ecoResponse = await getEcoResponse({
      messages: mensagensFormatadas,
      userId: usuario_id || "anon",
      accessToken: access_token,
    });

    const ecoText: string = ecoResponse?.message || "";
    console.log("[✅ Resposta da IA]", ecoText);

    if (!ecoText || ecoText.trim().length === 0) {
      return res.status(422).json({ error: "A resposta da IA veio vazia." });
    }

    // 4) TTS (aceita voice_id opcional para override)
    console.log("🎙️ Gerando áudio da resposta...", { voice_id_override: voice_id });
    const audioBuffer = await generateAudio(ecoText, voice_id);
    console.log("[✅ Áudio gerado] tamanho:", audioBuffer.length);

    // 5) Retorno
    return res.json({
      userText,
      ecoText,
      audioBase64: audioBuffer.toString("base64"),
    });
  } catch (err: any) {
    console.error("[❌ Erro no fluxo de voz]", err?.message || err);
    return res.status(500).json({ error: err?.message || "Erro no fluxo de voz completo" });
  }
});

/**
 * POST /ask-eco
 * Body: { usuario_id, mensagem?, mensagens?, access_token }
 */
router.post("/ask-eco", async (req, res) => {
  const { usuario_id, mensagem, mensagens, access_token } = req.body;

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
      accessToken: access_token,
    });

    return res.status(200).json({ message: resposta.message });
  } catch (err: any) {
    console.error("❌ Erro no /ask-eco:", err?.message || err);
    return res.status(500).json({ error: "Erro interno ao processar a requisição." });
  }
});

export default router;
