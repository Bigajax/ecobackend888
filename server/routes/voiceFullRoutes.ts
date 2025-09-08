import express from "express";
import multer from "multer";
import { generateAudio } from "../services/elevenlabsService";
import { getEcoResponse } from "../services/ecoCortex";
import { transcribeWithWhisper } from "../scripts/transcribe";

const router = express.Router();
const upload = multer(); // se quiser, limite de tamanho: multer({ limits:{ fileSize: 10*1024*1024 }})

router.post("/transcribe-and-respond", upload.single("audio"), async (req, res) => {
  try {
    const audioFile = req.file;
    const { nome_usuario, usuario_id, mensagens, access_token, voice_id } = req.body;

    if (!audioFile || !access_token) {
      return res.status(400).json({ error: "Áudio e token são obrigatórios." });
    }

    const userText = await transcribeWithWhisper(audioFile.buffer);
    if (!userText?.trim()) {
      return res.status(422).json({ error: "Transcrição vazia. Tente novamente." });
    }

    let msgs: any[] = [];
    try {
      const parsed = mensagens ? JSON.parse(mensagens) : [];
      msgs = Array.isArray(parsed) && parsed.length ? parsed : [{ role: "user", content: userText }];
    } catch {
      msgs = [{ role: "user", content: userText }];
    }

    const eco = await getEcoResponse({
      messages: msgs,
      userId: usuario_id || "anon",
      accessToken: access_token,
    });

    const ecoText = (eco?.message || "").trim();
    if (!ecoText) return res.status(422).json({ error: "A resposta da IA veio vazia." });

    const audioBuf = await generateAudio(ecoText, voice_id);

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      userText,
      ecoText,
      audioBase64: audioBuf.toString("base64"),
    });
  } catch (err: any) {
    console.error("[/transcribe-and-respond] erro:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Erro no fluxo de voz completo" });
  }
});

export default router;
