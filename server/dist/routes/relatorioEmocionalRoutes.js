"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mixpanelEvents_1 = require("../analytics/events/mixpanelEvents");
const relatorioEmocionalUtils_1 = require("../utils/relatorioEmocionalUtils");
const relatorioEmocionalView_1 = require("./relatorioEmocionalView");
const router = (0, express_1.Router)();
/* -------------------------------- helpers ------------------------------- */
function getUserIdFromReq(req) {
    // 1) query string
    const q = req.query?.usuario_id ||
        req.query?.userId ||
        null;
    if (q && typeof q === "string" && q.trim())
        return q.trim();
    // 2) Authorization: Bearer <jwt> → decodifica payload e pega sub/user_id
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
        try {
            const token = auth.slice(7);
            const parts = token.split(".");
            if (parts.length === 3) {
                const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
                return payload?.sub || payload?.user_id || payload?.uid || null;
            }
        }
        catch {
            // silencioso
        }
    }
    return null;
}
/* --------------------- GET /api/relatorio-emocional --------------------- */
router.get("/", async (req, res) => {
    try {
        const userId = getUserIdFromReq(req);
        if (!userId) {
            return res
                .status(400)
                .json({ success: false, error: "userId ausente. Envie ?usuario_id= ou use Bearer JWT." });
        }
        const relatorio = await (0, relatorioEmocionalUtils_1.gerarRelatorioEmocional)(userId);
        const view = (0, relatorioEmocionalView_1.extractRelatorioView)(req);
        const originPath = req.originalUrl ? req.originalUrl.split("?")[0] : req.path;
        (0, mixpanelEvents_1.trackRelatorioEmocionalAcessado)({
            distinctId: (0, relatorioEmocionalView_1.extractDistinctId)(req),
            userId,
            origem: `GET ${originPath}`,
            view,
        });
        return res.status(200).json({
            success: true,
            relatorio,
            perfil: relatorio, // compat com frontend atual
            message: "Relatório carregado com sucesso.",
        });
    }
    catch (err) {
        console.error("[❌ relatorio-emocional /] ", err?.message || err);
        return res.status(500).json({ success: false, error: "Erro ao gerar relatório emocional" });
    }
});
/* --------------- GET /api/relatorio-emocional/:usuario_id --------------- */
router.get("/:usuario_id", async (req, res) => {
    try {
        const { usuario_id } = req.params;
        if (!usuario_id || typeof usuario_id !== "string") {
            return res
                .status(400)
                .json({ success: false, error: "Parâmetro usuario_id ausente ou inválido." });
        }
        const relatorio = await (0, relatorioEmocionalUtils_1.gerarRelatorioEmocional)(usuario_id);
        const view = (0, relatorioEmocionalView_1.extractRelatorioView)(req);
        const originPath = req.originalUrl ? req.originalUrl.split("?")[0] : req.path;
        (0, mixpanelEvents_1.trackRelatorioEmocionalAcessado)({
            distinctId: (0, relatorioEmocionalView_1.extractDistinctId)(req),
            userId: usuario_id,
            origem: `GET ${originPath}`,
            view,
        });
        return res.status(200).json({
            success: true,
            relatorio,
            perfil: relatorio, // compat
            message: "Relatório carregado com sucesso.",
        });
    }
    catch (err) {
        console.error("[❌ relatorio-emocional /:usuario_id] ", err?.message || err);
        return res.status(500).json({ success: false, error: "Erro ao gerar relatório emocional" });
    }
});
exports.default = router;
//# sourceMappingURL=relatorioEmocionalRoutes.js.map