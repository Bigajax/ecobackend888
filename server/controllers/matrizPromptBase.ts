// Matriz de Decisão ECO (V3 enxuta)

type Nivel = 1 | 2 | 3;
type Camada = "core" | "emotional" | "advanced";

export interface CondicaoEspecial {
  descricao: string;
  regra: string; // variáveis: nivel, intensidade, curiosidade, pedido_pratico, duvida_classificacao
}
export interface Limites { prioridade?: string[]; }
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

export const matrizPromptBaseV2: MatrizPromptBaseV2 = {
  baseModules: {
    core: [
      "PRINCIPIOS_CHAVE.txt",
      "IDENTIDADE.txt",
      "ECO_ESTRUTURA_DE_RESPOSTA.txt",
      "MODULACAO_TOM_REGISTRO.txt",
      "MEMORIAS_CONTEXTO.txt",
      "ENCERRAMENTO_SENSIVEL.txt",
    ],
    emotional: [],
    advanced: [
      "ESCALA_ABERTURA_1a3.txt",      // 👈 novo “mapa” de abertura
      "ESCALA_INTENSIDADE_0a10.txt",
      "METODO_VIVA_ENXUTO.txt",
      "BLOCO_TECNICO_MEMORIA.txt",
    ],
  },

  // Agora TODO nível herda core + advanced — as regras/gates filtram o que entra
  byNivelV2: {
    1: { specific: [], inherits: ["core", "advanced"] },
    2: { specific: [], inherits: ["core", "advanced"] },
    3: { specific: [], inherits: ["core", "advanced"] },
  },

  // Compat legado
  alwaysInclude: [
    "PRINCIPIOS_CHAVE.txt",
    "IDENTIDADE.txt",
    "ECO_ESTRUTURA_DE_RESPOSTA.txt",
    "MODULACAO_TOM_REGISTRO.txt",
    "MEMORIAS_CONTEXTO.txt",
    "ENCERRAMENTO_SENSIVEL.txt",
  ],
  byNivel: { 1: ["ENCERRAMENTO_SENSIVEL.txt"], 2: [], 3: [] },

  // Gates mínimos
  intensidadeMinima: {
    "BLOCO_TECNICO_MEMORIA.txt": 7,
    "METODO_VIVA_ENXUTO.txt": 7,
  },

  // Regras semânticas
  condicoesEspeciais: {
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
  },

  // Prioridade do Budgeter (ContextBuilder já faz merge baseModules + aqui)
  limites: {
    prioridade: [
      // Core
      "PRINCIPIOS_CHAVE.txt",
      "IDENTIDADE.txt",
      "ECO_ESTRUTURA_DE_RESPOSTA.txt",
      "MODULACAO_TOM_REGISTRO.txt",
      "MEMORIAS_CONTEXTO.txt",
      "ENCERRAMENTO_SENSIVEL.txt",
      // Mapas
      "ESCALA_ABERTURA_1a3.txt",      // 👈 entra antes da escala de intensidade
      "ESCALA_INTENSIDADE_0a10.txt",
      // Intervenções
      "METODO_VIVA_ENXUTO.txt",
      // Saída técnica
      "BLOCO_TECNICO_MEMORIA.txt",
    ],
  },
};

export default matrizPromptBaseV2;
