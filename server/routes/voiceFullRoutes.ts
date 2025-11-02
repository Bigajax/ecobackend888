import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { generateAudio } from "../services/elevenlabsService";
import { supabaseWithBearer } from "../adapters/SupabaseAdapter";
import { getEcoResponse } from "../services/ConversationOrchestrator";
import { transcribeWithWhisper } from "../scripts/transcribe";
import { extractSessionMeta } from "./sessionMeta";
import { trackMensagemRecebida } from "../analytics/events/mixpanelEvents";

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

const getMensagemTipo = (
  mensagens: Array<{ role?: string }> | null | undefined
): "inicial" | "continuacao" => {
  if (!Array.isArray(mensagens) || mensagens.length === 0) return "inicial";
  if (mensagens.length === 1) return mensagens[0]?.role === "assistant" ? "continuacao" : "inicial";

  let previousUserMessages = 0;
  for (let i = 0; i < mensagens.length - 1; i += 1) {
    const role = mensagens[i]?.role;
    if (role === "assistant") return "continuacao";
    if (role === "user") previousUserMessages += 1;
  }

  return previousUserMessages > 0 ? "continuacao" : "inicial";
};

const coerceNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value.trim());
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
};

const extractAudioDurationMs = (payload: unknown): number | undefined => {
  if (!payload || typeof payload !== "object") return undefined;

  const source = payload as Record<string, unknown>;
  const candidates: Array<[unknown, number]> = [
    [source.audioDurationMs, 1],
    [source.audio_duration_ms, 1],
    [source.duracaoAudioMs, 1],
    [source.duracao_audio_ms, 1],
    [source.duracaoMs, 1],
    [source.duracao_ms, 1],
    [source.durationMs, 1],
    [source.duration_ms, 1],
    [source.audioDurationSeconds, 1000],
    [source.audio_duration_seconds, 1000],
    [source.audioDurationSec, 1000],
    [source.audio_duration_sec, 1000],
    [source.audioDuration, 1000],
    [source.durationSec, 1000],
  ];

  for (const [value, multiplier] of candidates) {
    const parsed = coerceNumber(value);
    if (parsed !== undefined) {
      return parsed * multiplier;
    }
  }

  return undefined;
};

const parseMensagens = (mensagens: unknown): any[] | undefined => {
  if (Array.isArray(mensagens)) return mensagens;
  if (typeof mensagens === "string" && mensagens.trim().length > 0) {
    try {
      const parsed = JSON.parse(mensagens);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return undefined;
    }
  }
  return undefined;
};

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

    const sessionMeta = extractSessionMeta(req.body);
    const mensagensParsed = parseMensagens(mensagens);
    const audioDurationMs = extractAudioDurationMs(req.body);
    const audioBytes = audioFile.buffer.length;

    const userText = await transcribeWithWhisper(audioFile.buffer);
    const normalizedUserText = userText ?? "";

    trackMensagemRecebida({
      distinctId: sessionMeta?.distinctId,
      userId: usuario_id,
      origem: "voz",
      tipo: getMensagemTipo(mensagensParsed),
      tamanhoBytes: audioBytes,
      duracaoMs: audioDurationMs,
      tamanhoCaracteres: normalizedUserText.length,
      timestamp: new Date().toISOString(),
      sessaoId: sessionMeta?.sessaoId ?? null,
      origemSessao: sessionMeta?.origem ?? null,
    });

    if (!normalizedUserText.trim()) {
      return res.status(422).json({ error: "Transcrição vazia. Tente novamente." });
    }

    const msgs =
      Array.isArray(mensagensParsed) && mensagensParsed.length
        ? mensagensParsed
        : [{ role: "user", content: normalizedUserText }];

    let authUid: string | null = null;
    try {
      const supabaseAuthClient = supabaseWithBearer(access_token);
      const { data, error } = await supabaseAuthClient.auth.getUser();
      if (!error && data?.user?.id) {
        authUid = data.user.id;
      }
    } catch (authError) {
      console.warn("[/transcribe-and-respond] falha ao obter auth.uid", authError);
    }

    const eco = await getEcoResponse({
      messages: msgs,
      userId: usuario_id || "anon",
      authUid,
      accessToken: access_token,
      sessionMeta,
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
