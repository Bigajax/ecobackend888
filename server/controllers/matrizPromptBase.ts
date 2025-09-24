// controllers/matrizPromptBase.ts
// Matriz de Decisão ECO (V3 enxuta) — alinhada aos módulos em /assets

// ===== Tipos locais =====
export interface CondicaoEspecial {
  descricao: string;
  // Variáveis aceitas: nivel, intensidade, curiosidade, pedido_pratico, duvida_classificacao
  regra: string;
}
export interface Limites {
  // Ordem de prioridade para o Budgeter (módulos mais “essenciais” primeiro)
  prioridade?: string[];
}

export interface MatrizPromptBase {
  alwaysInclude: string[];                       // compat legado
  byNivel: Record<number, string[]>;            // compat legado
  intensidadeMinima: Record<string, number>;    // gates por intensidade
  condicoesEspeciais: Record<string, CondicaoEspecial>;
  limites?: Limites;
}

// Níveis/camadas
type Nivel = 1 | 2 | 3;
type Camada = "core" | "emotional" | "advanced";

// V2: herança por camadas (core/emotional/advanced)
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

/* =======================================================================================
   Matriz V3 (enxuta) — ARQUIVOS DEVEM EXISTIR EM /assets CONFORME:
   - /assets/modulos_core
     • PRINCIPIOS_CHAVE.txt
     • IDENTIDADE.txt
     • ECO_ESTRUTURA_DE_RESPOSTA.txt
     • MODULACAO_TOM_REGISTRO.txt
     • MEMORIAS_CONTEXTO.txt
     • ENCERRAMENTO_SENSIVEL.txt
   - /assets/modulos_extras
     • METODO_VIVA_ENXUTO.txt
     • ESCALA_INTENSIDADE_0a10.txt
     • BLOCO_TECNICO_MEMORIA.txt
   (emotional/filosóficos opcionais; não listados aqui)
======================================================================================= */

export const matrizPromptBaseV2: MatrizPromptBaseV2 = {
  /* ---------------- Núcleo + Advanced (extras condicionais) ---------------- */
  baseModules: {
    core: [
      "PRINCIPIOS_CHAVE.txt",
      "IDENTIDADE.txt",
      "ECO_ESTRUTURA_DE_RESPOSTA.txt",
      "MODULACAO_TOM_REGISTRO.txt",
      "MEMORIAS_CONTEXTO.txt",
      "ENCERRAMENTO_SENSIVEL.txt",
    ],
    emotional: [], // reservado p/ futuros módulos emocionais “sempre que herdar”
    advanced: [
      "METODO_VIVA_ENXUTO.txt",
      "ESCALA_INTENSIDADE_0a10.txt",
      "BLOCO_TECNICO_MEMORIA.txt",
    ],
  },

  // Todo nível herda o core; o advanced entra por regras/gates
  byNivelV2: {
    1: { specific: [], inherits: ["core"] },
    2: { specific: [], inherits: ["core"] },
    3: { specific: [], inherits: ["core"] },
  },

  /* ---------------- Compatibilidade legado (não usados no V2) --------------- */
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

  /* -------------------------- Gates por intensidade ------------------------- */
  intensidadeMinima: {
    "BLOCO_TECNICO_MEMORIA.txt": 7, // JSON técnico só em ≥7
    "METODO_VIVA_ENXUTO.txt": 7,    // VIVA seletivo em ≥7 (e nível ≥2 via regra)
    // A escala é “mapa”, sem threshold mínimo
  },

  /* --------------------------- Regras semânticas ---------------------------- */
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

  /* ---------------------- Prioridade p/ o Budgeter -------------------------- */
  // ContextBuilder já faz o “merge” de baseModules + limites.prioridade.
  // Mantemos aqui a ordem relativa caso o orçamento aperte.
  limites: {
    prioridade: [
      // 🔝 Core (nunca cortar)
      "PRINCIPIOS_CHAVE.txt",
      "IDENTIDADE.txt",
      "ECO_ESTRUTURA_DE_RESPOSTA.txt",
      "MODULACAO_TOM_REGISTRO.txt",
      "MEMORIAS_CONTEXTO.txt",
      "ENCERRAMENTO_SENSIVEL.txt",
      // 🎚️ Mapa
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
