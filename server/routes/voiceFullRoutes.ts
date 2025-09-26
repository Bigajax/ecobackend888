import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { generateAudio } from "../services/elevenlabsService";
import { getEcoResponse } from "../services/ConversationOrchestrator";
import { transcribeWithWhisper } from "../scripts/transcribe";

const router = express.Router();

const DEFAULT_MAX_AUDIO_BYTES = 6 * 1024 * 1024; // 6MB – suficiente para ~1min em 64kbps
const parsedLimit = Number(process.env.VOICE_MAX_AUDIO_BYTES);
const MAX_AUDIO_BYTES = Number.isFinite(parsedLimit) && parsedLimit > 0
  ? parsedLimit
  : DEFAULT_MAX_AUDIO_BYTES;

type RequestWithAudio = Request & {
  file?: {
    buffer: Buffer;
  };
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES },
});

const VOICE_FIXED = (process.env.ELEVEN_VOICE_ID || "e5WNhrdI30aXpS2RSGm1").trim();

const singleAudioUpload = upload.single("audio");

function isFileSizeLimitError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "LIMIT_FILE_SIZE"
  );
}

router.post("/transcribe-and-respond", (req: Request, res: Response, next: NextFunction) => {
  singleAudioUpload(req, res, (err: unknown) => {
    if (err) {
      if (isFileSizeLimitError(err)) {
        return res.status(413).json({ error: "Arquivo de áudio excede o tamanho máximo permitido." });
      }
      console.error("[/transcribe-and-respond] erro ao fazer upload:", err);
      return res.status(400).json({ error: "Falha ao processar o áudio enviado." });
    }
    return next();
  });
}, async (req: Request, res: Response) => {
  try {
    const { file: audioFile } = req as RequestWithAudio;
    const { nome_usuario, usuario_id, mensagens, access_token } = req.body;

    if (!audioFile || !access_token) {
      return res.status(400).json({ error: "Áudio e token são obrigatórios." });
    }

    if (!Buffer.isBuffer(audioFile.buffer)) {
      return res.status(400).json({ error: "Arquivo de áudio inválido." });
    }

    if (audioFile.buffer.length > MAX_AUDIO_BYTES) {
      return res.status(413).json({ error: "Arquivo de áudio excede o tamanho máximo permitido." });
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

    // 👇 força SEMPRE a voz fixa
    const audioBuf = await generateAudio(ecoText, VOICE_FIXED);

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("x-voice-id", VOICE_FIXED); // 👈 ver no Network
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
