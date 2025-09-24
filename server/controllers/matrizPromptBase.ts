// server/controllers/matrizPromptBase.ts

/* ======================== Tipos (Opção A) ======================== */
type Nivel = 1 | 2 | 3;
type Camada = "core" | "emotional" | "advanced";

export interface CondicaoEspecial {
  descricao: string;
  regra: string; // usa: nivel, intensidade, curiosidade, pedido_pratico, duvida_classificacao
}
export interface Limites {
  prioridade?: string[];
}
export interface MatrizPromptBase {
  alwaysInclude: string[];
  byNivel: Record<number, string[]>;
  intensidadeMinima: Record<string, number>;
  condicoesEspeciais: Record<string, CondicaoEspecial>;
  limites?: Limites;
}
export interface MatrizPromptBaseV2 extends MatrizPromptBase {
  baseModules: Record<Camada, string[]>;
  byNivelV2: Record<Nivel, { specific: string[]; inherits: Camada[] }>;
}

/* ======================== Matriz (V2) ======================== */
export const matrizPromptBaseV2: MatrizPromptBaseV2 = {
  /* ================= base ================= */
  baseModules: {
    // Core completo só para NV2/3
    core: [
      "IDENTIDADE.txt",           // ✅ manter
    "MODULACAO_TOM_REGISTRO.txt", // ✅ manter  
    "ENCERRAMENTO_SENSIVEL.txt", 
    ],
    emotional: [],
    advanced: [
      "ESCALA_ABERTURA_1a3.txt",
      "ESCALA_INTENSIDADE_0a10.txt",
      "METODO_VIVA_ENXUTO.txt",
      "BLOCO_TECNICO_MEMORIA.txt",
    ],
  },

  // NV1: não herda core pesado; usa específicos enxutos.
  byNivelV2: {
    1: { specific: ["NV1_CORE.txt", "IDENTIDADE_MINI.txt"], inherits: ["advanced"] },
    2: { specific: [], inherits: ["core", "advanced"] },
    3: { specific: [], inherits: ["core", "advanced"] },
  },

  /* ============== compat legado (mantém, mas NV1 usa os novos) ============== */
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
    "ESCALA_ABERTURA_1a3.txt": { descricao: "Mapa de abertura 1–3 para calibrar tom/ritmo", regra: "nivel>=1" },
    "ESCALA_INTENSIDADE_0a10.txt": { descricao: "Mapa para calibrar tom/ritmo; usar quando houver emoção em cena", regra: "nivel>=1" },
    "METODO_VIVA_ENXUTO.txt": { descricao: "Ativar quando emoção clara (≥7) e abertura ≥2; máx. 3 movimentos", regra: "intensidade>=7 && nivel>=2" },
    "BLOCO_TECNICO_MEMORIA.txt": { descricao: "Gerar bloco técnico ao final quando emoção ≥7", regra: "intensidade>=7" },
    "ENCERRAMENTO_SENSIVEL.txt": { descricao: "Fechar suave quando houver assentimento/pausa ou queda de energia", regra: "nivel>=1" },

    // — Filosóficos / Cognitivos / Emocionais (inalterados) —
    "eco_observador_presente.txt": { descricao: "Marco Aurélio — foco no agora", regra: "nivel>=2 && intensidade>=3 && intensidade<=6 && !pedido_pratico" },
    "eco_presenca_racional.txt": { descricao: "Fatos vs. interpretações", regra: "nivel>=2 && intensidade>=3 && intensidade<=6 && !pedido_pratico" },
    "eco_corpo_emocao.txt": { descricao: "Voltar para sensação direta", regra: "nivel>=2 && intensidade>=3 && intensidade<=7 && !pedido_pratico" },
    "eco_fim_do_sofrimento.txt": { descricao: "Acolhimento do sofrimento", regra: "nivel>=2 && intensidade>=3 && intensidade<=7 && !pedido_pratico" },
    "eco_identificacao_mente.txt": { descricao: "Desidentificação suave", regra: "nivel>=2 && intensidade>=3 && intensidade<=6 && !pedido_pratico" },

    "eco_heuristica_ancoragem.txt": { descricao: "Antes idealizado", regra: "nivel>=2 && intensidade>=3 && intensidade<=6 && !pedido_pratico" },
    "eco_heuristica_causas_superam_estatisticas.txt": { descricao: "História vívida > estatística", regra: "nivel>=2 && intensidade>=3 && intensidade<=6 && !pedido_pratico" },
    "eco_heuristica_certeza_emocional.txt": { descricao: "Certeza por coerência emocional", regra: "nivel>=2 && intensidade>=4 && intensidade<=7 && !pedido_pratico" },
    "eco_heuristica_disponibilidade.txt": { descricao: "Disponibilidade", regra: "nivel>=2 && intensidade>=2 && intensidade<=6 && !pedido_pratico" },
    "eco_heuristica_excesso_confianca.txt": { descricao: "Excesso de confiança", regra: "nivel>=2 && intensidade>=3 && intensidade<=6 && !pedido_pratico" },
    "eco_heuristica_ilusao_validade.txt": { descricao: "Ilusão de validade", regra: "nivel>=2 && intensidade>=3 && intensidade<=6 && !pedido_pratico" },
    "eco_heuristica_intuicao_especialista.txt": { descricao: "Intuição de autoridade", regra: "nivel>=2 && intensidade>=3 && intensidade<=6 && !pedido_pratico" },
    "eco_heuristica_regressao_media.txt": { descricao: "Regressão à média", regra: "nivel>=2 && intensidade>=2 && intensidade<=6 && !pedido_pratico" },
    "heuristica_ilusao_compreensao.txt": { descricao: "Ilusão de compreensão", regra: "nivel>=2 && intensidade>=3 && intensidade<=6 && !pedido_pratico" },

    "eco_emo_vergonha_combate.txt": { descricao: "Vergonha / autoimagem", regra: "nivel>=2 && intensidade>=4" },
    "eco_vulnerabilidade_defesas.txt": { descricao: "Armaduras", regra: "nivel>=2 && intensidade>=4" },
    "eco_vulnerabilidade_mitos.txt": { descricao: "Vulnerabilidade como coragem", regra: "nivel>=2 && intensidade>=3" },
  },

  /* ============== prioridade (Budgeter) ============== */
  limites: {
    prioridade: [
      // NV1 enxuto
      "NV1_CORE.txt",
      "IDENTIDADE_MINI.txt",
      // Mapas
      "ESCALA_ABERTURA_1a3.txt",
      "ESCALA_INTENSIDADE_0a10.txt",
      // Core completo (para NV2/3)
      "PRINCIPIOS_CHAVE.txt",
      "IDENTIDADE.txt",
      "ECO_ESTRUTURA_DE_RESPOSTA.txt",
      "MODULACAO_TOM_REGISTRO.txt",
      "MEMORIAS_CONTEXTO.txt",
      "ENCERRAMENTO_SENSIVEL.txt",
      // Intervenções / técnico
      "METODO_VIVA_ENXUTO.txt",
      "BLOCO_TECNICO_MEMORIA.txt",
    ],
  },
};

export default matrizPromptBaseV2;
