"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const Selector_1 = require("../../services/promptContext/Selector");
const heuristicaFlags_1 = require("../../services/promptContext/heuristicaFlags");
(0, node_test_1.default)("inclui módulo de ancoragem quando heurística correspondente é detectada", () => {
    const heuristicas = [
        { arquivo: "eco_heuristica_ancoragem.txt", similarity: 0.91, tags: ["ancoragem"] },
    ];
    const heuristicaFlags = (0, heuristicaFlags_1.mapHeuristicasToFlags)(heuristicas);
    const flags = Selector_1.Selector.derivarFlags("Texto neutro sem pedido prático.", heuristicaFlags);
    const resultado = Selector_1.Selector.selecionarModulosBase({
        nivel: 2,
        intensidade: 5,
        flags,
    });
    strict_1.default.ok(resultado.posGating.includes("eco_heuristica_ancoragem.txt"), "deveria ativar o módulo de ancoragem");
});
(0, node_test_1.default)("inclui módulo de certeza emocional quando flag derivada por tags é verdadeira", () => {
    const heuristicas = [
        { id: "abc", tags: ["certeza_emocional", "conviccao_rapida"] },
    ];
    const heuristicaFlags = (0, heuristicaFlags_1.mapHeuristicasToFlags)(heuristicas);
    const flags = Selector_1.Selector.derivarFlags("Mensagem reflexiva sem pedidos.", heuristicaFlags);
    const resultado = Selector_1.Selector.selecionarModulosBase({
        nivel: 3,
        intensidade: 6,
        flags,
    });
    strict_1.default.ok(resultado.posGating.includes("eco_heuristica_certeza_emocional.txt"), "deveria ativar o módulo de certeza emocional");
});
//# sourceMappingURL=SelectorHeuristicas.test.js.map