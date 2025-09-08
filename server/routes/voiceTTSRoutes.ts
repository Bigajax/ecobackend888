import express from "express";
import { generateAudio } from "../services/elevenlabsService";

const router = express.Router();

/** Gera TTS e retorna MP3 binário */
router.post("/tts", async (req, res) => {
  try {
    const { text, voice_id } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Campo 'text' é obrigatório." });
    }

    const audio = await generateAudio(text, voice_id);

    res.set({
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "Content-Length": audio.length.toString(),
    });

    return res.status(200).send(audio);
  } catch (e: any) {
    console.error("[TTS ERROR]", e?.message || e);
    return res.status(500).json({ error: e?.message || "Erro ao gerar áudio" });
  }
});

/** Resposta clara para métodos incorretos (evita 405 confuso) */
router.all("/tts", (_req, res) => {
  res.status(405).json({ error: "Método não permitido. Use POST em /api/voice/tts." });
});

export default router;
