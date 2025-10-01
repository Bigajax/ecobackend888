"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// routes/feedbackRoutes.ts
const express_1 = require("express");
const zod_1 = require("zod");
const supabaseAdmin_1 = require("../lib/supabaseAdmin"); // ✅ usa a instância
const router = (0, express_1.Router)();
const FeedbackSchema = zod_1.z.object({
    sessaoId: zod_1.z.string().min(6),
    usuarioId: zod_1.z.string().uuid().optional(),
    mensagemId: zod_1.z.string().uuid().optional(), // envie só se for ID real do BANCO
    rating: zod_1.z.union([zod_1.z.literal(1), zod_1.z.literal(-1)]),
    reason: zod_1.z.string().trim().max(2000).optional(),
    source: zod_1.z.string().default("thumb_prompt"),
    meta: zod_1.z.record(zod_1.z.unknown()).optional(), // <- sem 'any'
});
// POST /api/feedback
// eslint-disable-next-line @typescript-eslint/no-misused-promises
router.post("/", async (req, res) => {
    const parsed = FeedbackSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            error: "Payload inválido",
            details: parsed.error.flatten(),
        });
        return;
    }
    const payload = parsed.data;
    const insertBody = {
        sessao_id: payload.sessaoId,
        usuario_id: payload.usuarioId ?? null,
        rating: payload.rating,
        reason: payload.reason ?? null,
        source: payload.source,
        meta: payload.meta ?? {},
        created_at: new Date().toISOString(), // (opcional) útil se a tabela não tiver default
    };
    // só define FK se vier (evita erro de chave estrangeira)
    if (payload.mensagemId) {
        insertBody.mensagem_id = payload.mensagemId;
    }
    try {
        const { error } = await supabaseAdmin_1.supabase
            .from("feedback_interacoes")
            .insert(insertBody);
        if (error) {
            console.error("[feedback] insert error:", error);
            res.status(500).json({
                error: "Falha ao salvar feedback",
                details: error.message,
            });
            return;
        }
        res.status(201).json({ ok: true });
    }
    catch (e) {
        // erro de configuração (ex.: envs do Supabase ausentes)
        console.error("[feedback] supabase error:", e);
        res.status(500).json({
            error: "Falha ao inicializar serviço de dados",
            details: e?.message ?? String(e),
        });
    }
});
exports.default = router;
//# sourceMappingURL=feedback.js.map