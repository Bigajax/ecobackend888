// services/promptContext/matrizPromptBaseV2.ts
import {
  MatrizPromptBaseV2,
  Camada,
  CondicaoEspecial,
  Nivel,
} from "./types";

/* ======================== Matriz (V2) ======================== */
const matrizPromptBaseV2: MatrizPromptBaseV2 = {
  /* ============== base ============== */
  baseModules: {
    core: [
      "IDENTIDADE.txt",
      "MODULACAO_TOM_REGISTRO.txt",
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

  /* ============== NV por camada ============== */
  byNivelV2: {
    // NV1 enxuto: sem advanced; só escala mínima manual p/ calibrar tom
    1: {
      specific: [
        "NV1_CORE.txt",
        "IDENTIDADE_MINI.txt",
        "ANTISALDO_MIN.txt",
        "ESCALA_ABERTURA_1a3.txt",
      ],
      inherits: [] as Camada[],
    },
    2: { specific: [], inherits: ["core", "advanced"] as Camada[] },
    3: { specific: [], inherits: ["core", "advanced"] as Camada[] },
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
    "METODO_VIVA_ENXUTO.txt": 7, // VIVA só considera intensidade alta
  },

  /* ============== regras semânticas ============== */
  condicoesEspeciais: {
    "ESCALA_ABERTURA_1a3.txt": {
      descricao: "Mapa de abertura 1–3 para calibrar tom/ritmo",
      regra: "nivel>=1",
    },
    "ESCALA_INTENSIDADE_0a10.txt": {
      descricao:
        "Mapa para calibrar tom/ritmo; usar quando houver emoção em cena",
      regra: "nivel>=1",
    },

    // >>> VIVA conforme pipeline:
    // - Ativar: intensidade >= 7 AND abertura (nivel) >= 2
    // - Não ativar: saudação, factual, pedido prático, cansaço sem intensidade, desabafo (sem querer intervenção)
    // OBS: flags assumem Selector.derivarFlags(texto)
    "METODO_VIVA_ENXUTO.txt": {
      descricao:
        "Ativar quando emoção clara (≥7) e abertura ≥2; máx. 3 movimentos; evitar em saudação/factual/pedido prático/cansaço/desabafo.",
      regra:
        "intensidade>=7 && nivel>=2 && !pedido_pratico && !saudacao && !factual && !cansaco && !desabafo",
    },

    "BLOCO_TECNICO_MEMORIA.txt": {
      descricao: "Gerar bloco técnico ao final quando emoção ≥7",
      regra: "intensidade>=7",
    },
    "ENCERRAMENTO_SENSIVEL.txt": {
      descricao:
        "Fechar suave quando houver assentimento/pausa ou queda de energia",
      regra: "nivel>=1",
    },

    /* ====== Heurísticas (inclui extremos) ====== */
    "eco_heuristica_disponibilidade.txt": {
      descricao: "Disponibilidade",
      regra:
        "(intensidade<=2 || intensidade>=8) && nivel>=2 && !pedido_pratico",
    },
    "eco_heuristica_excesso_confianca.txt": {
      descricao: "Excesso de confiança",
      regra:
        "((intensidade>=2 && intensidade<=6) || intensidade>=8) && nivel>=2 && !pedido_pratico",
    },
    "eco_heuristica_ilusao_validade.txt": {
      descricao: "Ilusão de validade",
      regra:
        "((intensidade>=2 && intensidade<=6) || intensidade>=8) && nivel>=2 && !pedido_pratico",
    },
    "heuristica_ilusao_compreensao.txt": {
      descricao: "Ilusão de compreensão",
      regra:
        "((intensidade>=2 && intensidade<=6) || intensidade>=8) && nivel>=2 && !pedido_pratico",
    },

    // … adicione as demais, quando necessário, mantendo o mesmo padrão de tipo …
  } as Record<string, CondicaoEspecial>,

  /* ============== prioridade (budget) ============== */
  limites: {
    prioridade: [
      // NV1
      "NV1_CORE.txt",
      "IDENTIDADE_MINI.txt",
      "ANTISALDO_MIN.txt",
      "ESCALA_ABERTURA_1a3.txt",

      // Mapas
      "ESCALA_INTENSIDADE_0a10.txt",

      // Core / legado
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

export { matrizPromptBaseV2 };
export default matrizPromptBaseV2;
