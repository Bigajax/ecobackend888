"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryController = void 0;
exports.createMemoryController = createMemoryController;
const supabaseAdmin_1 = require("../../lib/supabaseAdmin");
const repository_1 = require("./repository");
const service_1 = require("./service");
function toBool(value, fallback = false) {
    if (typeof value === "boolean")
        return value;
    if (typeof value === "string")
        return value.toLowerCase() === "true";
    return fallback;
}
const safeLog = (s) => process.env.NODE_ENV === "production" ? (s || "").slice(0, 80) + "…" : s || "";
class MemoryController {
    service;
    supabaseClient;
    constructor({ repository, service, supabaseClient } = {}) {
        const repo = repository ?? new repository_1.MemoryRepository();
        this.service = service ?? new service_1.MemoryService(repo);
        this.supabaseClient = supabaseClient ?? supabaseAdmin_1.supabase;
    }
    async getAuthenticatedUser(req) {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer "))
            return null;
        const token = authHeader.slice("Bearer ".length).trim();
        try {
            const { data, error } = await this.supabaseClient.auth.getUser(token);
            if (error || !data?.user) {
                console.warn("[Auth] Falha ao obter usuário:", error?.message);
                return null;
            }
            return data.user;
        }
        catch (err) {
            console.error("[Auth] Erro no getUser(jwt):", err?.message ?? err);
            return null;
        }
    }
    registerMemory = async (req, res) => {
        const user = await this.getAuthenticatedUser(req);
        if (!user)
            return res.status(401).json({ error: "Usuário não autenticado." });
        const { texto, tags, intensidade, mensagem_id, emocao_principal, contexto, dominio_vida, padrao_comportamental, salvar_memoria = true, nivel_abertura, analise_resumo, categoria = "emocional", } = req.body ?? {};
        if (!texto || typeof intensidade !== "number") {
            return res.status(400).json({ error: "Campos obrigatórios ausentes ou inválidos." });
        }
        try {
            const result = await this.service.registerMemory(user.id, {
                texto,
                tags,
                intensidade,
                mensagem_id,
                emocao_principal,
                contexto,
                dominio_vida,
                padrao_comportamental,
                salvar_memoria: toBool(salvar_memoria, true),
                nivel_abertura,
                analise_resumo,
                categoria,
            });
            return res.status(201).json({ success: true, table: result.table, data: result.data });
        }
        catch (error) {
            console.error("❌ Erro inesperado ao salvar:", error?.message || error);
            return res.status(500).json({ error: "Erro inesperado no servidor." });
        }
    };
    listMemories = async (req, res) => {
        const user = await this.getAuthenticatedUser(req);
        if (!user)
            return res.status(401).json({ error: "Usuário não autenticado." });
        const limiteParam = (req.query.limite ?? req.query.limit);
        const limit = Math.max(0, Number(limiteParam ?? 0)) || undefined;
        let tags = [];
        const queryTags = req.query.tags;
        if (Array.isArray(queryTags)) {
            tags = queryTags
                .flatMap((tag) => String(tag).split(","))
                .map((tag) => tag.trim())
                .filter(Boolean);
        }
        else if (typeof queryTags === "string") {
            tags = queryTags.split(",").map((t) => t.trim()).filter(Boolean);
        }
        try {
            const memories = await this.service.listMemories(user.id, { tags, limit });
            console.log(`📥 ${memories.length} memórias retornadas para ${user.id}`);
            return res.status(200).json({ success: true, memories });
        }
        catch (error) {
            console.error("❌ Erro inesperado ao buscar memórias:", error?.message || error);
            return res.status(500).json({ error: "Erro inesperado no servidor." });
        }
    };
    findSimilar = async (req, res) => {
        const user = await this.getAuthenticatedUser(req);
        if (!user)
            return res.status(401).json({ error: "Usuário não autenticado." });
        const textoRaw = String(req.body?.texto ?? req.body?.query ?? "");
        const texto = textoRaw.trim();
        const limiteRaw = Number(req.body?.limite ?? req.body?.limit ?? 3);
        const limite = Math.max(1, Math.min(5, Number.isNaN(limiteRaw) ? 3 : limiteRaw));
        let threshold = Math.max(0, Math.min(1, Number(req.body?.threshold ?? 0.15)));
        if (/lembr|record|memó/i.test(texto))
            threshold = Math.min(threshold, 0.12);
        if (texto.length < 20)
            threshold = Math.min(threshold, 0.1);
        console.log("📩 /similares:", { texto: safeLog(texto), limite, threshold });
        if (!texto) {
            return res.status(400).json({ error: "Texto para análise é obrigatório." });
        }
        if (texto.length < 3) {
            return res.status(200).json({ success: true, similares: [] });
        }
        try {
            const similares = await this.service.findSimilarMemories(user.id, {
                texto,
                limite,
                threshold,
            });
            console.log(`🔍 ${similares.length} memórias semelhantes normalizadas.`);
            return res.status(200).json({ success: true, similares });
        }
        catch (error) {
            console.error("❌ Erro em /similares:", error?.message || error);
            return res.status(500).json({ error: "Erro inesperado no servidor." });
        }
    };
}
exports.MemoryController = MemoryController;
function createMemoryController(deps) {
    return new MemoryController(deps);
}
//# sourceMappingURL=controller.js.map