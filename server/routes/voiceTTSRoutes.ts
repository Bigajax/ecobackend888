import express from "express";
import { generateAudio } from "../services/elevenlabsService";

const router = express.Router();

const VOICE_FIXED = (process.env.ELEVEN_VOICE_ID || "e5WNhrdI30aXpS2RSGm1").trim();

/** Gera TTS e retorna MP3 binário */
router.post("/tts", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Campo 'text' é obrigatório." });
    }

    // Validar se API key está configurada
    if (!process.env.ELEVEN_API_KEY && !process.env.ELEVENLABS_API_KEY && !process.env.ELEVEN_TOKEN) {
      console.error("[TTS ERROR] ELEVEN_API_KEY não configurada no ambiente");
      return res.status(503).json({
        error: "Serviço TTS não configurado. Contate o administrador.",
        details: "Missing ELEVEN_API_KEY environment variable"
      });
    }

    // Definir timeout de 20 segundos para não exceder o timeout do cliente
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("ElevenLabs API timeout (20s)")), 20000)
    );

    const audio = await Promise.race([
      generateAudio(text, VOICE_FIXED),
      timeoutPromise
    ]);

    res.set({
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "Content-Length": audio.length.toString(),
      "x-voice-id": VOICE_FIXED, // 👈 ajuda a depurar no Network
    });

    return res.status(200).send(audio);
  } catch (e: any) {
    console.error("[TTS ERROR]", {
      message: e?.message || e,
      status: e?.status,
      responseBody: e?.responseBody
    });

    // Retornar status apropriado baseado no erro
    if (e?.message?.includes("ELEVEN_API_KEY")) {
      return res.status(503).json({ error: "Serviço TTS indisponível (chave não configurada)" });
    }
    if (e?.message?.includes("timeout") || e?.message?.includes("ElevenLabs")) {
      return res.status(504).json({ error: "ElevenLabs timeout. Tente novamente." });
    }

    return res.status(500).json({ error: e?.message || "Erro ao gerar áudio" });
  }
});

router.all("/tts", (_req, res) => {
  res.status(405).json({ error: "Método não permitido. Use POST em /api/voice/tts." });
});

export default router;
