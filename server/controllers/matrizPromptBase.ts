// ================================
// Matriz de Decisão ECO (V3 — Enxuta)
// Compatível com as interfaces/validador atuais
// ================================

export const matrizPromptBaseV2: MatrizPromptBaseV2 = {
  // ===== SISTEMA DE HERANÇA (enxuto) =====
  baseModules: {
    core: [
      // modulos_core/
      'PRINCIPIOS_CHAVE.txt',
      'IDENTIDADE.txt',
      'ECO_ESTRUTURA_DE_RESPOSTA.txt',
      'MODULACAO_TOM_REGISTRO.txt',
      'MEMORIAS_CONTEXTO.txt',
      'ENCERRAMENTO_SENSIVEL.txt',
    ],
    // não usamos mais pacotes “emocional” dedicados — fica vazio
    emotional: [],

    // extras acionados por gatilho (modulos_extras/)
    advanced: [
      'METODO_VIVA_ENXUTO.txt',
      'ESCALA_INTENSIDADE_0a10.txt',
      'BLOCO_TECNICO_MEMORIA.txt',
    ],
  },

  // ===== Mapeamento por nível (simples: todo mundo herda o core) =====
  byNivelV2: {
    1: { specific: [], inherits: ['core'] },
    2: { specific: [], inherits: ['core'] },
    3: { specific: [], inherits: ['core'] },
  },

  // ===== COMPATIBILIDADE LEGADA =====
  alwaysInclude: [
    'PRINCIPIOS_CHAVE.txt',
    'IDENTIDADE.txt',
    'ECO_ESTRUTURA_DE_RESPOSTA.txt',
    'MODULACAO_TOM_REGISTRO.txt',
    'MEMORIAS_CONTEXTO.txt',
    'ENCERRAMENTO_SENSIVEL.txt',
  ],

  byNivel: {
    1: ['ENCERRAMENTO_SENSIVEL.txt'], // redundante mas mantido para legacy
    2: [],
    3: [],
  },

  // ===== GATING POR INTENSIDADE (apenas o que precisa) =====
  intensidadeMinima: {
    'BLOCO_TECNICO_MEMORIA.txt': 7,     // gerar JSON só em ≥7 (ou regras da escala)
    'METODO_VIVA_ENXUTO.txt': 7,        // VIVA só quando houver emoção forte
    // A escala não precisa de threshold (é mapa sempre útil) — não listar aqui
  },

  // ===== REGRAS SEMÂNTICAS (extras) =====
  condicoesEspeciais: {
    // Escala: pode entrar sempre que houver conteúdo emocional (fica leve)
    'ESCALA_INTENSIDADE_0a10.txt': {
      descricao: 'Mapa para calibrar tom/ritmo; usar quando houver emoção em cena',
      regra: 'nivel>=1', // sempre disponível
    },

    'METODO_VIVA_ENXUTO.txt': {
      descricao: 'Ativar quando emoção clara (≥7) e abertura ≥2; máx. 3 movimentos',
      regra: 'intensidade>=7 && nivel>=2',
    },

    'BLOCO_TECNICO_MEMORIA.txt': {
      descricao: 'Gerar bloco técnico ao final quando emoção ≥7',
      regra: 'intensidade>=7',
    },

    // Core que podem ser reafirmados (opcional)
    'ENCERRAMENTO_SENSIVEL.txt': {
      descricao: 'Fechar suave quando houver assentimento/pausa ou queda de energia',
      regra: 'nivel>=1',
    },
  },

  // ===== PRIORIZAÇÃO DE BUDGET (ordem de corte) =====
  limites: {
    prioridade: [
      // 🔝 NÚCLEO ESSENCIAL (nunca cortar)
      'PRINCIPIOS_CHAVE.txt',
      'IDENTIDADE.txt',
      'ECO_ESTRUTURA_DE_RESPOSTA.txt',
      'MODULACAO_TOM_REGISTRO.txt',
      'MEMORIAS_CONTEXTO.txt',
      'ENCERRAMENTO_SENSIVEL.txt',

      // 🎚️ MAPA SEMPRE ÚTIL
      'ESCALA_INTENSIDADE_0a10.txt',

      // 🫖 INTERVENÇÃO CONDICIONAL
      'METODO_VIVA_ENXUTO.txt',

      // 🧠 SAÍDA TÉCNICA (pode cortar sob budget apertado; só quando for exigida)
      'BLOCO_TECNICO_MEMORIA.txt',
    ],
  },
};
