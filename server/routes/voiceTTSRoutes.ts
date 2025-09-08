import { Router } from "express";
import { generateAudio } from "../services/elevenlabsService";

const router = Router();

/** POST /api/voice/tts  Body: { text: string, voice_id?: string } */
router.post("/tts", async (req, res) => {
  try {
    const { text, voice_id } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Campo 'text' é obrigatório." });
    }

    const audio = await generateAudio(text, voice_id);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(Buffer.from(audio));
  } catch (err: any) {
    console.error("[/tts] erro:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Erro ao gerar áudio" });
  }
});

export default router;
