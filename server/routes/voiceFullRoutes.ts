// routes/voiceFullRouter.ts
import express from "express";
import multer from "multer";
import { generateAudio } from "../services/elevenlabsService";
import { getEcoResponse } from "../services/ecoCortex";
import { transcribeWithWhisper } from "../scripts/transcribe";

const router = express.Router();

/** Multer em memória + limites defensivos (máx ~15MB / 90s de fala aprox.) */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

/**
 * POST /transcribe-and-respond
 * Body (form-data):
 *  - audio (file)         ✅ obrigatório
 *  - access_token         ✅ obrigatório
 *  - usuario_id           opcional
 *  - nome_usuario         opcional
 *  - mensagens (JSON)     opcional (histórico)
 *  - voice_id             opcional (override da voz na ElevenLabs)
 * Query/Headers:
 *  - stream=1             opcional → responde com audio/mpeg (stream) em vez de JSON base64
 *    (ou defina Accept: audio/* para o mesmo efeito)
 */
router.post(
  "/transcribe-and-respond",
  upload.single("audio"),
  async (req, res) => {
    try {
      const audioFile = req.file;
      const {
        nome_usuario,
        usuario_id,
        mensagens,
        access_token,
        voice_id,
      } = req.body;

      if (!audioFile || !access_token) {
        return res.status(400).json({ error: "Áudio e token são obrigatórios." });
      }

      // Aceita stream direto de áudio?
      const wantsStream =
        String(req.query.stream || "").toLowerCase() === "1" ||
        String(req.headers.accept || "").includes("audio/");

      console.log("📥 Recebido /transcribe-and-respond:", {
        nome_usuario,
        usuario_id,
        audioMime: audioFile.mimetype,
        audioSize: audioFile.size,
        wantsStream,
      });

      // 1) Transcrição (Whisper)
      console.log("📝 Transcrevendo áudio com Whisper...");
      const userText = await transcribeWithWhisper(audioFile.buffer);
      console.log("✅ Whisper:", userText);

      if (!userText || typeof userText !== "string" || userText.trim().length === 0) {
        return res.status(422).json({ error: "Transcrição vazia. Tente novamente." });
      }

      // 2) Prepara histórico pra IA
      let mensagensFormatadas: any[] = [];
      try {
        if (mensagens) {
          const parsed = typeof mensagens === "string" ? JSON.parse(mensagens) : mensagens;
          if (Array.isArray(parsed) && parsed.length > 0) mensagensFormatadas = parsed;
        }
      } catch {
        // Ignora erro no parse e cai no fallback abaixo
      }
      if (mensagensFormatadas.length === 0) {
        mensagensFormatadas = [{ id: `voice-${Date.now()}`, role: "user", content: userText }];
      }

      console.log("🧠 Enviando p/ IA:", mensagensFormatadas.length, "mensagens");

      // 3) Resposta da IA
      const ecoResponse = await getEcoResponse({
        messages: mensagensFormatadas,
        userId: usuario_id || "anon",
        accessToken: access_token,
      });

      const ecoText: string = (ecoResponse?.message || "").trim();
      console.log("✅ Resposta da IA:", ecoText);

      if (!ecoText) {
        return res.status(422).json({ error: "A resposta da IA veio vazia." });
      }

      // 4) TTS (ElevenLabs)
      let audioBuffer: Buffer | null = null;
      let ttsError: string | null = null;

      try {
        console.log("🎙️ Gerando TTS...", { voice_id_override: voice_id || "(default)" });
        audioBuffer = await generateAudio(ecoText, voice_id);
        console.log("✅ Áudio gerado:", audioBuffer.length, "bytes");
      } catch (e: any) {
        ttsError = e?.message || "Falha ao gerar áudio no ElevenLabs.";
        console.error("❌ TTS error:", ttsError);
      }

      // 5) Resposta
      if (audioBuffer && wantsStream) {
        // Stream direto (útil pra <audio src="/api/.../transcribe-and-respond?stream=1">)
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).send(audioBuffer);
      }

      // JSON (com base64) — mantém texto mesmo se TTS falhar
      return res.status(200).json({
        userText,
        ecoText,
        audioBase64: audioBuffer ? audioBuffer.toString("base64") : null,
        ttsError, // null se OK; string se falhou (front pode decidir como lidar)
      });
    } catch (err: any) {
      console.error("❌ Erro no /transcribe-and-respond:", err?.message || err);
      // Diferencia alguns erros comuns de upload
      if (err?.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "Áudio muito grande (limite ~15MB)." });
      }
      return res.status(500).json({ error: err?.message || "Erro no fluxo de voz completo." });
    }
  }
);

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
    const mensagensParaIA =
      mensagens ||
      (mensagem ? [{ role: "user", content: String(mensagem) }] : []);

    const resposta = await getEcoResponse({
      messages: mensagensParaIA,
      userId: usuario_id,
      accessToken: access_token,
    });

    return res.status(200).json({ message: (resposta?.message || "").trim() });
  } catch (err: any) {
    console.error("❌ Erro no /ask-eco:", err?.message || err);
    return res.status(500).json({ error: "Erro interno ao processar a requisição." });
  }
});

export default router;
