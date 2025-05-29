"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express")); // Importe Router, Request e Response do 'express'
// REMOVA OU COMENTE a linha abaixo. Você não precisa dos tipos Vercel aqui.
// import { VercelRequest, VercelResponse } from '@vercel/node';
const openrouterController_1 = require("../controllers/openrouterController"); // Certifique-se que o caminho está correto
const router = express_1.default.Router();
// Altere os tipos dos parâmetros 'req' e 'res' para Request e Response do Express
router.post('/ask-eco', async (req, res) => {
    // O 'handleAskEco' também precisa estar esperando Request e Response
    // Se 'handleAskEco' ainda espera VercelRequest/VercelResponse,
    // você DEVE mudar a assinatura dele também.
    // Por enquanto, vou assumir que você também vai ajustá-lo.
    await (0, openrouterController_1.handleAskEco)(req, res);
});
exports.default = router;
//# sourceMappingURL=openrouterRoutes.js.map