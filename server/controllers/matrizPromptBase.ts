// controllers/matrizPromptBase.ts
// Matriz de Decisão ECO (V3 — Enxuta) + Tipos locais para evitar erro TS2304

// ===== Tipos =====
export interface CondicaoEspecial {
  descricao: string;
  regra: string; // variáveis: nivel, intensidade, curiosidade, pedido_pratico, duvida_classificacao
}
export interface Limites {
  prioridade?: string[]; // ordem sugerida sob budget
}
export interface MatrizPromptBase {
  alwaysInclude: string[];
  byNivel: Record<number, string[]>;
  intensidadeMinima: Record<string, number>;
  condicoesEspeciais: Record<string, CondicaoEspecial>;
  limites?: Limites;
}

type Nivel = 1 | 2 | 3;
type Camada = "core" | "emotional" | "advanced";

export interface MatrizPromptBaseV2 extends MatrizPromptBase {
  baseModules: Record<Camada, string[]>;
  byNivelV2: Record<
    Nivel,
    {
      specific: string[];
      inherits: Camada[];
    }
  >;
}

// ===== Matriz V3 Enxuta =====
export const matrizPromptBaseV2: MatrizPromptBaseV2 = {
  // Núcleo + Extras
  baseModules: {
    core: [
      "PRINCIPIOS_CHAVE.txt",
      "IDENTIDADE.txt",
      "ECO_ESTRUTURA_DE_RESPOSTA.txt",
      "MODULACAO_TOM_REGISTRO.txt",
      "MEMORIAS_CONTEXTO.txt",
      "ENCERRAMENTO_SENSIVEL.txt",
    ],
    emotional: [], // mantido vazio por compatibilidade
    advanced: [
      "METODO_VIVA_ENXUTO.txt",
      "ESCALA_INTENSIDADE_0a10.txt",
      "BLOCO_TECNICO_MEMORIA.txt",
    ],
  },

  // Todo nível herda o core; extras entram por condicional
  byNivelV2: {
    1: { specific: [], inherits: ["core"] },
    2: { specific: [], inherits: ["core"] },
    3: { specific: [], inherits: ["core"] },
  },

  // Compat legado (mantido, mas mínimo)
  alwaysInclude: [
    "PRINCIPIOS_CHAVE.txt",
    "IDENTIDADE.txt",
    "ECO_ESTRUTURA_DE_RESPOSTA.txt",
    "MODULACAO_TOM_REGISTRO.txt",
    "MEMORIAS_CONTEXTO.txt",
    "ENCERRAMENTO_SENSIVEL.txt",
  ],
  byNivel: {
    1: ["ENCERRAMENTO_SENSIVEL.txt"],
    2: [],
    3: [],
  },

  // Gating (mínimo necessário)
  intensidadeMinima: {
    "BLOCO_TECNICO_MEMORIA.txt": 7,   // JSON técnico só em ≥7
    "METODO_VIVA_ENXUTO.txt": 7,      // VIVA seletivo em ≥7
    // A escala é “mapa”, não precisa threshold
  },

  // Regras semânticas
  condicoesEspeciais: {
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
  },

  // Prioridade de budget (ordem de corte)
  limites: {
    prioridade: [
      // 🔝 Núcleo — nunca cortar
      "PRINCIPIOS_CHAVE.txt",
      "IDENTIDADE.txt",
      "ECO_ESTRUTURA_DE_RESPOSTA.txt",
      "MODULACAO_TOM_REGISTRO.txt",
      "MEMORIAS_CONTEXTO.txt",
      "ENCERRAMENTO_SENSIVEL.txt",
      // 🎚️ Mapa sempre útil
      "ESCALA_INTENSIDADE_0a10.txt",
      // 🫖 Intervenção condicional
      "METODO_VIVA_ENXUTO.txt",
      // 🧠 Saída técnica (cortável se budget apertar)
      "BLOCO_TECNICO_MEMORIA.txt",
    ],
  },
};

// export default para compat com import * as Matriz / Matriz.default
export default matrizPromptBaseV2;
