"use strict";
// Matriz de Decisão ECO (V3 — enxuta)
Object.defineProperty(exports, "__esModule", { value: true });
exports.matrizPromptBaseV2 = void 0;
exports.matrizPromptBaseV2 = {
    /* ================= base ================= */
    baseModules: {
        core: [
            "PRINCIPIOS_CHAVE.txt",
            "IDENTIDADE.txt",
            "ECO_ESTRUTURA_DE_RESPOSTA.txt",
            "MODULACAO_TOM_REGISTRO.txt",
            "MEMORIAS_CONTEXTO.txt",
            "ENCERRAMENTO_SENSIVEL.txt",
        ],
        emotional: [], // reservado (compat)
        advanced: [
            "ESCALA_ABERTURA_1a3.txt", // mapa de abertura
            "ESCALA_INTENSIDADE_0a10.txt", // mapa de intensidade
            "METODO_VIVA_ENXUTO.txt",
            "BLOCO_TECNICO_MEMORIA.txt",
        ],
    },
    // Todo nível herda core + advanced (o gating decide o que entra de fato)
    byNivelV2: {
        1: { specific: [], inherits: ["core", "advanced"] },
        2: { specific: [], inherits: ["core", "advanced"] },
        3: { specific: [], inherits: ["core", "advanced"] },
    },
    /* ============== compat legado ============== */
    alwaysInclude: [
        "PRINCIPIOS_CHAVE.txt",
        "IDENTIDADE.txt",
        "ECO_ESTRUTURA_DE_RESPOSTA.txt",
        "MODULACAO_TOM_REGISTRO.txt",
        "MEMORIAS_CONTEXTO.txt",
        "ENCERRAMENTO_SENSIVEL.txt",
    ],
    byNivel: { 1: ["ENCERRAMENTO_SENSIVEL.txt"], 2: [], 3: [] },
    /* ============== gates mínimos ============== */
    intensidadeMinima: {
        "BLOCO_TECNICO_MEMORIA.txt": 7,
        "METODO_VIVA_ENXUTO.txt": 7,
    },
    /* ============== regras semânticas ============== */
    condicoesEspeciais: {
        // Mapas/base
        "ESCALA_ABERTURA_1a3.txt": {
            descricao: "Mapa de abertura 1–3 para calibrar tom/ritmo",
            regra: "nivel>=1",
        },
        "ESCALA_INTENSIDADE_0a10.txt": {
            descricao: "Mapa para calibrar tom/ritmo; usar quando houver emoção em cena",
            regra: "nivel>=1",
        },
        "METODO_VIVA_ENXUTO.txt": {
            descricao: "Ativar quando emoção clara (≥7) e abertura ≥2; máx. 3 movimentos",
            regra: "intensidade>=7 && nivel>=2",
        },
        "BLOCO_TECNICO_MEMORIA.txt": {
            descricao: "Gerar bloco técnico ao final quando emoção ≥7",
            regra: "intensidade>=7",
        },
        "ENCERRAMENTO_SENSIVEL.txt": {
            descricao: "Fechar suave quando houver assentimento/pausa ou queda de energia",
            regra: "nivel>=1",
        },
        // ===== Filosóficos/Estoicos (documentativo; seleção real via selecionarExtras) =====
        "eco_observador_presente.txt": {
            descricao: "Marco Aurélio — foco no agora, atenção e discernimento",
            regra: "nivel>=2 && intensidade>=3 && intensidade<=6 && !pedido_pratico",
        },
        "eco_presenca_racional.txt": {
            descricao: "Sobriedade estoica: fatos vs. interpretações; resposta interna",
            regra: "nivel>=2 && intensidade>=3 && intensidade<=6 && !pedido_pratico",
        },
        "eco_corpo_emocao.txt": {
            descricao: "Voltar do excesso de mente para sensação direta; localizar emoção no corpo",
            regra: "nivel>=2 && intensidade>=3 && intensidade<=7 && !pedido_pratico",
        },
        "eco_fim_do_sofrimento.txt": {
            descricao: "Acolhimento radical do sofrimento; observar sem lutar, desfazendo identificação",
            regra: "nivel>=2 && intensidade>=3 && intensidade<=7 && !pedido_pratico",
        },
        "eco_identificacao_mente.txt": {
            descricao: "Desidentificação suave: observar pensamentos sem se fundir com eles",
            regra: "nivel>=2 && intensidade>=3 && intensidade<=6 && !pedido_pratico",
        },
        // ===== Cognitivas (documentativo; seleção real via heuristicasTriggers + selecionarExtras) =====
        "eco_heuristica_ancoragem.txt": {
            descricao: "Comparação do presente com um 'antes' idealizado",
            regra: "nivel>=2 && intensidade>=3 && intensidade<=6 && !pedido_pratico",
        },
        "eco_heuristica_causas_superam_estatisticas.txt": {
            descricao: "História vívida pesa mais que estatísticas/taxa-base; abrir quadro maior",
            regra: "nivel>=2 && intensidade>=3 && intensidade<=6 && !pedido_pratico",
        },
        "eco_heuristica_certeza_emocional.txt": {
            descricao: "Certeza narrativa sustentada por coerência emocional; abrir nuance sem confronto",
            regra: "nivel>=2 && intensidade>=4 && intensidade<=7 && !pedido_pratico",
        },
        "eco_heuristica_disponibilidade.txt": {
            descricao: "Lembrança recente/vívida domina o julgamento; ampliar campo sem invalidar",
            regra: "nivel>=2 && intensidade>=2 && intensidade<=6 && !pedido_pratico",
        },
        "eco_heuristica_excesso_confianca.txt": {
            descricao: "Certeza narrativa muito alta; abrir frestas de dúvida gentil sem confronto",
            regra: "nivel>=2 && intensidade>=3 && intensidade<=6 && !pedido_pratico",
        },
        "eco_heuristica_ilusao_validade.txt": {
            descricao: "Alta confiança subjetiva sem validação externa; abrir espaço para contraprovas",
            regra: "nivel>=2 && intensidade>=3 && intensidade<=6 && !pedido_pratico",
        },
        "eco_heuristica_intuicao_especialista.txt": {
            descricao: "Confiança em intuição de autoridade; checar contexto (feedback/estabilidade)",
            regra: "nivel>=2 && intensidade>=3 && intensidade<=6 && !pedido_pratico",
        },
        "eco_heuristica_regressao_media.txt": {
            descricao: "Normalizar oscilações após picos/vales; foco em processo e janelas mais longas",
            regra: "nivel>=2 && intensidade>=2 && intensidade<=6 && !pedido_pratico",
        },
        // ✅ nome alinhado ao arquivo existente em assets/config
        "heuristica_ilusao_compreensao.txt": {
            descricao: "Suavizar certeza retrospectiva; abrir para múltiplas causas e incerteza",
            regra: "nivel>=2 && intensidade>=3 && intensidade<=6 && !pedido_pratico",
        },
        // ===== Emocionais (documentativo; seleção real via emocionaisTriggerMap + selecionarExtras) =====
        "eco_emo_vergonha_combate.txt": {
            descricao: "Emocional — vergonha/autoimagem; separar pessoa de comportamento e abrir pertencimento",
            regra: "nivel>=2 && intensidade>=4",
        },
        "eco_vulnerabilidade_defesas.txt": {
            descricao: "Emocional — reconhecer armaduras; honrar função antiga e abrir microescolhas hoje",
            regra: "nivel>=2 && intensidade>=4",
        },
        "eco_vulnerabilidade_mitos.txt": {
            descricao: "Emocional — re-enquadrar vulnerabilidade como coragem com discernimento",
            regra: "nivel>=2 && intensidade>=3",
        },
    },
    /* ============== prioridade (Budgeter) ============== */
    limites: {
        prioridade: [
            // Core (nunca cortar)
            "PRINCIPIOS_CHAVE.txt",
            "IDENTIDADE.txt",
            "ECO_ESTRUTURA_DE_RESPOSTA.txt",
            "MODULACAO_TOM_REGISTRO.txt",
            "MEMORIAS_CONTEXTO.txt",
            "ENCERRAMENTO_SENSIVEL.txt",
            // Mapas
            "ESCALA_ABERTURA_1a3.txt",
            "ESCALA_INTENSIDADE_0a10.txt",
            // Intervenções
            "METODO_VIVA_ENXUTO.txt",
            // Saída técnica
            "BLOCO_TECNICO_MEMORIA.txt",
        ],
    },
};
exports.default = exports.matrizPromptBaseV2;
//# sourceMappingURL=matrizPromptBase.js.map