"use strict";
// server/routes/promptRoutes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const promptController_1 = require("../controllers/promptController");
const router = (0, express_1.Router)();
console.log('Backend: promptRoutes carregado.');
/**
 * GET /api/prompt-mestre
 * Retorna o prompt mestre já montado e em cache.
 */
router.get('/prompt-mestre', async (req, res) => {
    try {
        await (0, promptController_1.getPromptMestre)(req, res);
    }
    catch (error) {
        console.error('Erro no handler de rota /prompt-mestre:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Erro interno ao obter o prompt mestre.' });
        }
    }
});
exports.default = router;
//# sourceMappingURL=promptRoutes.js.map