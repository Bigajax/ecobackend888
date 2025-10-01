"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const elevenlabsService_1 = require("../services/elevenlabsService");
const ConversationOrchestrator_1 = require("../services/ConversationOrchestrator");
const transcribe_1 = require("../scripts/transcribe");
const sessionMeta_1 = require("./sessionMeta");
const mixpanelEvents_1 = require("../analytics/events/mixpanelEvents");
const router = express_1.default.Router();
const DEFAULT_MAX_AUDIO_BYTES = 6 * 1024 * 1024; // 6MB – suficiente para ~1min em 64kbps
const parsedLimit = Number(process.env.VOICE_MAX_AUDIO_BYTES);
const MAX_AUDIO_BYTES = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? parsedLimit
    : DEFAULT_MAX_AUDIO_BYTES;
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: MAX_AUDIO_BYTES },
});
const VOICE_FIXED = (process.env.ELEVEN_VOICE_ID || "e5WNhrdI30aXpS2RSGm1").trim();
const singleAudioUpload = upload.single("audio");
function isFileSizeLimitError(error) {
    return (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "LIMIT_FILE_SIZE");
}
const getMensagemTipo = (mensagens) => {
    if (!Array.isArray(mensagens) || mensagens.length === 0)
        return "inicial";
    if (mensagens.length === 1)
        return mensagens[0]?.role === "assistant" ? "continuacao" : "inicial";
    let previousUserMessages = 0;
    for (let i = 0; i < mensagens.length - 1; i += 1) {
        const role = mensagens[i]?.role;
        if (role === "assistant")
            return "continuacao";
        if (role === "user")
            previousUserMessages += 1;
    }
    return previousUserMessages > 0 ? "continuacao" : "inicial";
};
const coerceNumber = (value) => {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : undefined;
    }
    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number.parseFloat(value.trim());
        return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
};
const extractAudioDurationMs = (payload) => {
    if (!payload || typeof payload !== "object")
        return undefined;
    const source = payload;
    const candidates = [
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
const parseMensagens = (mensagens) => {
    if (Array.isArray(mensagens))
        return mensagens;
    if (typeof mensagens === "string" && mensagens.trim().length > 0) {
        try {
            const parsed = JSON.parse(mensagens);
            if (Array.isArray(parsed))
                return parsed;
        }
        catch {
            return undefined;
        }
    }
    return undefined;
};
router.post("/transcribe-and-respond", (req, res, next) => {
    singleAudioUpload(req, res, (err) => {
        if (err) {
            if (isFileSizeLimitError(err)) {
                return res.status(413).json({ error: "Arquivo de áudio excede o tamanho máximo permitido." });
            }
            console.error("[/transcribe-and-respond] erro ao fazer upload:", err);
            return res.status(400).json({ error: "Falha ao processar o áudio enviado." });
        }
        return next();
    });
}, async (req, res) => {
    try {
        const { file: audioFile } = req;
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
        const sessionMeta = (0, sessionMeta_1.extractSessionMeta)(req.body);
        const mensagensParsed = parseMensagens(mensagens);
        const audioDurationMs = extractAudioDurationMs(req.body);
        const audioBytes = audioFile.buffer.length;
        const userText = await (0, transcribe_1.transcribeWithWhisper)(audioFile.buffer);
        const normalizedUserText = userText ?? "";
        (0, mixpanelEvents_1.trackMensagemRecebida)({
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
        const msgs = Array.isArray(mensagensParsed) && mensagensParsed.length
            ? mensagensParsed
            : [{ role: "user", content: normalizedUserText }];
        const eco = await (0, ConversationOrchestrator_1.getEcoResponse)({
            messages: msgs,
            userId: usuario_id || "anon",
            accessToken: access_token,
            sessionMeta,
        });
        const ecoText = (eco?.message || "").trim();
        if (!ecoText)
            return res.status(422).json({ error: "A resposta da IA veio vazia." });
        // 👇 força SEMPRE a voz fixa
        const audioBuf = await (0, elevenlabsService_1.generateAudio)(ecoText, VOICE_FIXED);
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("x-voice-id", VOICE_FIXED); // 👈 ver no Network
        return res.json({
            userText,
            ecoText,
            audioBase64: audioBuf.toString("base64"),
        });
    }
    catch (err) {
        console.error("[/transcribe-and-respond] erro:", err?.message || err);
        return res.status(500).json({ error: err?.message || "Erro no fluxo de voz completo" });
    }
});
exports.default = router;
//# sourceMappingURL=voiceFullRoutes.js.map