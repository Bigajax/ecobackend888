"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const supabaseAdmin_1 = require("../lib/supabaseAdmin");
const ConversationOrchestrator_1 = require("../services/ConversationOrchestrator");
const embeddingService_1 = require("../services/embeddingService");
const buscarMemorias_1 = require("../services/buscarMemorias");
const router = express_1.default.Router();
// log seguro de trechos (evita vazar texto completo em prod)
const safeLog = (s) => process.env.NODE_ENV === "production" ? (s || "").slice(0, 60) + "…" : s || "";
// normaliza array de mensagens da UI
function normalizarMensagens(body) {
    const { messages, mensagens, mensagem } = body || {};
    if (Array.isArray(messages))
        return messages;
    if (Array.isArray(mensagens))
        return mensagens;
    if (mensagem)
        return [{ role: "user", content: mensagem }];
    return null;
}
router.post("/ask-eco", async (req, res) => {
    const { usuario_id, nome_usuario } = req.body;
    const mensagensParaIA = normalizarMensagens(req.body);
    // auth
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Token de acesso ausente." });
    }
    const token = authHeader.replace("Bearer ", "").trim();
    if (!usuario_id || !mensagensParaIA) {
        return res.status(400).json({ error: "usuario_id e messages são obrigatórios." });
    }
    try {
        const { data, error } = await supabaseAdmin_1.supabaseAdmin.auth.getUser(token);
        if (error || !data?.user) {
            return res.status(401).json({ error: "Token inválido ou usuário não encontrado." });
        }
        // última mensagem
        const ultimaMsg = String(mensagensParaIA.at(-1)?.content ?? "");
        console.log("🗣️ Última mensagem:", safeLog(ultimaMsg));
        // embedding só quando fizer sentido
        let queryEmbedding;
        if (ultimaMsg.trim().length >= 6) {
            try {
                const raw = await (0, embeddingService_1.embedTextoCompleto)(ultimaMsg);
                queryEmbedding = Array.isArray(raw) ? raw : JSON.parse(String(raw));
                if (!Array.isArray(queryEmbedding))
                    queryEmbedding = undefined;
            }
            catch (e) {
                console.warn("⚠️ Falha ao gerar embedding:", e?.message);
            }
        }
        // threshold adaptativo para recall melhor
        let threshold = 0.15;
        if (ultimaMsg.trim().length < 20)
            threshold = 0.10;
        if (/lembr|record|memó/i.test(ultimaMsg))
            threshold = Math.min(threshold, 0.12);
        // busca de memórias (helper unificado)
        let memsSimilares = [];
        try {
            memsSimilares = await (0, buscarMemorias_1.buscarMemoriasSemelhantes)(usuario_id, {
                userEmbedding: queryEmbedding,
                texto: queryEmbedding ? undefined : ultimaMsg,
                k: 5,
                threshold,
            });
            console.log("🔎 Memórias similares:", memsSimilares.map((m) => ({
                id: m.id?.slice(0, 8),
                sim: m.similaridade ?? m.similarity ?? 0,
            })));
        }
        catch (memErr) {
            console.warn("⚠️ Falha na busca de memórias semelhantes:", memErr?.message);
            memsSimilares = [];
        }
        // orquestrador (única chamada)
        const resposta = await (0, ConversationOrchestrator_1.getEcoResponse)({
            messages: mensagensParaIA,
            userId: usuario_id,
            userName: nome_usuario,
            accessToken: token,
            mems: memsSimilares,
        });
        return res.status(200).json(resposta);
    }
    catch (err) {
        console.error("❌ Erro no /ask-eco:", err);
        return res.status(500).json({
            error: "Erro interno ao processar a requisição.",
            details: { message: err?.message, stack: err?.stack },
        });
    }
});
exports.default = router;
//# sourceMappingURL=openrouterRoutes.js.map