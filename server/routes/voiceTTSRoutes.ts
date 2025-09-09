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

    const audio = await generateAudio(text, VOICE_FIXED);

    res.set({
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "Content-Length": audio.length.toString(),
      "x-voice-id": VOICE_FIXED, // 👈 ajuda a depurar no Network
    });

    return res.status(200).send(audio);
  } catch (e: any) {
    console.error("[TTS ERROR]", e?.message || e);
    return res.status(500).json({ error: e?.message || "Erro ao gerar áudio" });
  }
});

router.all("/tts", (_req, res) => {
  res.status(405).json({ error: "Método não permitido. Use POST em /api/voice/tts." });
});

export default router;
