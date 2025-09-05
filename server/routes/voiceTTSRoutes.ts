import express from "express";
import { generateAudio } from "../services/elevenlabsService";

const router = express.Router();

/**
 * POST /tts
 * Body: { text, voice_id? }
 * Retorna o MP3 direto (audio/mpeg)
 */
router.post("/tts", async (req, res) => {
  try {
    const { text, voice_id } = req.body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "Texto inválido ou ausente" });
    }

    const audioBuffer = await generateAudio(text, voice_id);

    res.setHeader("Content-Type", "audio/mpeg");
    return res.send(audioBuffer);
  } catch (err: any) {
    console.error("[TTS Error]", err?.message || err);
    return res.status(500).json({ error: err?.message || "Erro ao gerar áudio" });
  }
});

export default router;
