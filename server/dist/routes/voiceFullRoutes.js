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
const router = express_1.default.Router();
const upload = (0, multer_1.default)();
const VOICE_FIXED = (process.env.ELEVEN_VOICE_ID || "e5WNhrdI30aXpS2RSGm1").trim();
router.post("/transcribe-and-respond", upload.single("audio"), async (req, res) => {
    try {
        const audioFile = req.file;
        const { nome_usuario, usuario_id, mensagens, access_token } = req.body;
        if (!audioFile || !access_token) {
            return res.status(400).json({ error: "Áudio e token são obrigatórios." });
        }
        const userText = await (0, transcribe_1.transcribeWithWhisper)(audioFile.buffer);
        if (!userText?.trim()) {
            return res.status(422).json({ error: "Transcrição vazia. Tente novamente." });
        }
        let msgs = [];
        try {
            const parsed = mensagens ? JSON.parse(mensagens) : [];
            msgs = Array.isArray(parsed) && parsed.length ? parsed : [{ role: "user", content: userText }];
        }
        catch {
            msgs = [{ role: "user", content: userText }];
        }
        const eco = await (0, ConversationOrchestrator_1.getEcoResponse)({
            messages: msgs,
            userId: usuario_id || "anon",
            accessToken: access_token,
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