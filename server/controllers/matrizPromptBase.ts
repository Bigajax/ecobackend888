// ================================
// Matriz de Decisão ECO (V2)
// ================================

export interface CondicaoEspecial {
  descricao: string;
  regra: string; // variáveis disponíveis: nivel, intensidade, curiosidade, pedido_pratico, duvida_classificacao
}

export interface Limites {
  prioridade?: string[]; // ordem sugerida sob budget
}

// Interface base mantida para compatibilidade
export interface MatrizPromptBase {
  alwaysInclude: string[];
  byNivel: Record<number, string[]>;
  intensidadeMinima: Record<string, number>;
  condicoesEspeciais: Record<string, CondicaoEspecial>;
  limites?: Limites;
}

// Tipos auxiliares
type Nivel = 1 | 2 | 3;
type Camada = 'core' | 'emotional' | 'advanced';

// Interface estendida com sistema de herança
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

// Versão otimizada aplicando melhorias
export const matrizPromptBaseV2: MatrizPromptBaseV2 = {
  // ===== SISTEMA DE HERANÇA (NOVO) =====
  baseModules: {
    core: [
      'PRINCIPIOS_CHAVE.txt',
      'IDENTIDADE.txt',
      'ECO_ESTRUTURA_DE_RESPOSTA.txt',
      'POLITICA_REDIRECIONAMENTO.txt',
      // ⬇️ entra em todos os níveis, inclusive NV1
      'CRITERIO_ENCERRAMENTO_SENSIVEL.txt',
    ],
    emotional: [
      'CONTEXTO_EMOCIONAL.txt',
      'MODULACAO_TOM_REGISTRO.txt',
      'CONTINUIDADE_EMOCIONAL.txt',
      'CRITERIO_SUFICIENCIA_REFLEXIVA.txt',
      'ADAPTACAO_CULTURAL_LINGUISTICA.txt',
      'VARIEDADE_FORMA_TOM.txt', // playbook unificado
    ],
    advanced: [
      'MEMORIAS_REFERENCIAS_CONTEXTO.txt',
      'REVIVER_MEMORIAS.txt',
      'EVOLUCAO_NIVEL_ABERTURA.txt',
      'EVOLUCAO_EMOCIONAL_E_NARRATIVA.txt',
      'ESTRUTURA_NARRATIVA_VARIAVEL.txt',
      'HEURISTICA_EXAUSTAO.txt',
      'SITUACOES_ESPECIFICAS.txt',
      'BLOCO_TECNICO_MEMORIA.txt',
      'ESCALA_INTENSIDADE.txt',
    ],
  },

  byNivelV2: {
    1: { specific: ['ECO_ORQUESTRA_NIVEL1.txt'], inherits: ['core'] },
    2: {
      specific: [
        'ECO_ORQUESTRA_NIVEL2.txt',
        'MOVIMENTOS_INFORMATIVOS.txt',
        'METODO_VIVA.txt',
        'CONVITE_PARA_EXPLORACAO.txt',
        'IDENTIFICACAO_PADROES.txt',
        'META_REFLEXAO.txt',
        'NARRATIVA_SOFISTICADA.txt',
      ],
      inherits: ['core', 'emotional'],
    },
    3: {
      specific: ['ECO_ORQUESTRA_NIVEL3.txt', 'PERGUNTAS_ABERTAS.txt'],
      inherits: ['core', 'emotional', 'advanced'],
    },
  },

  // ===== COMPATIBILIDADE RETROATIVA =====
  alwaysInclude: [
    'PRINCIPIOS_CHAVE.txt',
    'IDENTIDADE.txt',
    'ECO_ESTRUTURA_DE_RESPOSTA.txt',
    'POLITICA_REDIRECIONAMENTO.txt',
    // ✅ também no legado para NV1 puro
    'CRITERIO_ENCERRAMENTO_SENSIVEL.txt',
  ],

  byNivel: {
    1: [
      'ECO_ORQUESTRA_NIVEL1.txt',
      // ✅ garante presença no legado NV1
      'CRITERIO_ENCERRAMENTO_SENSIVEL.txt',
    ],
    2: [
      'ECO_ORQUESTRA_NIVEL2.txt',
      'CONTEXTO_EMOCIONAL.txt',
      'MOVIMENTOS_INFORMATIVOS.txt',
      'METODO_VIVA.txt',
      'MODULACAO_TOM_REGISTRO.txt',
      'CONTINUIDADE_EMOCIONAL.txt',
      'CRITERIO_SUFICIENCIA_REFLEXIVA.txt',
      'ADAPTACAO_CULTURAL_LINGUISTICA.txt',
      'VARIEDADE_FORMA_TOM.txt',
      'CONVITE_PARA_EXPLORACAO.txt',
      'IDENTIFICACAO_PADROES.txt',
      'META_REFLEXAO.txt',
      'NARRATIVA_SOFISTICADA.txt',
      // ✅ legado NV2
      'CRITERIO_ENCERRAMENTO_SENSIVEL.txt',
    ],
    3: [
      'ECO_ORQUESTRA_NIVEL3.txt',
      'CONTEXTO_EMOCIONAL.txt',
      'MOVIMENTOS_INFORMATIVOS.txt',
      'METODO_VIVA.txt',
      'MODULACAO_TOM_REGISTRO.txt',
      'CONTINUIDADE_EMOCIONAL.txt',
      'CRITERIO_SUFICIENCIA_REFLEXIVA.txt',
      'ADAPTACAO_CULTURAL_LINGUISTICA.txt',
      'VARIEDADE_FORMA_TOM.txt',
      'PERGUNTAS_ABERTAS.txt',
      'MEMORIAS_REFERENCIAS_CONTEXTO.txt',
      'REVIVER_MEMORIAS.txt',
      'EVOLUCAO_NIVEL_ABERTURA.txt',
      'EVOLUCAO_EMOCIONAL_E_NARRATIVA.txt',
      'ESTRUTURA_NARRATIVA_VARIAVEL.txt',
      'HEURISTICA_EXAUSTAO.txt',
      'SITUACOES_ESPECIFICAS.txt',
      'BLOCO_TECNICO_MEMORIA.txt',
      'ESCALA_INTENSIDADE.txt',
      'CONVITE_PARA_EXPLORACAO.txt',
      'IDENTIFICACAO_PADROES.txt',
      'META_REFLEXAO.txt',
      'NARRATIVA_SOFISTICADA.txt',
      // ✅ legado NV3
      'CRITERIO_ENCERRAMENTO_SENSIVEL.txt',
    ],
  },

  // ===== GATING POR INTENSIDADE =====
  intensidadeMinima: {
    'BLOCO_TECNICO_MEMORIA.txt': 7,
    'ESCALA_INTENSIDADE.txt': 7,
    'METODO_VIVA.txt': 7,
    'HEURISTICA_EXAUSTAO.txt': 7,
  },

  // ===== REGRAS SEMÂNTICAS =====
  condicoesEspeciais: {
    'METODO_VIVA.txt': {
      descricao: 'Ativar apenas em emoção forte e abertura real',
      regra: 'intensidade>=7 && nivel>=2',
    },
    'META_REFLEXAO.txt': {
      descricao: 'Só quando há material emocional para investigar processo',
      regra: 'intensidade>=6 && nivel>=2',
    },
    'CONVITE_PARA_EXPLORACAO.txt': {
      descricao: 'Abrir espaço com cuidado quando já há movimento emocional',
      regra: 'intensidade>=5 && nivel>=2',
    },
    'IDENTIFICACAO_PADROES.txt': {
      descricao: 'Apontar padrões apenas com abertura suficiente',
      regra: 'intensidade>=5 && nivel>=2',
    },
    'NARRATIVA_SOFISTICADA.txt': {
      descricao: 'Usar cadência/imagens suaves só se houver campo',
      regra: 'intensidade>=5 && nivel>=2',
    },
    'MOVIMENTOS_INFORMATIVOS.txt': {
      descricao: 'Explicações/insights curtos só com curiosidade/pedido ou dúvida de classificação',
      regra: 'nivel>=2 && (curiosidade==true || pedido_pratico==true || duvida_classificacao==true)',
    },
    'PERGUNTAS_ABERTAS.txt': {
      descricao: 'Perguntas fenomenológicas quando há abertura clara',
      regra: 'nivel==3 || (nivel==2 && curiosidade==true)',
    },
    'EVOLUCAO_NIVEL_ABERTURA.txt': {
      descricao: 'Acompanhar mudança de abertura durante a sessão',
      regra: 'nivel==3 || (nivel==2 && intensidade>=6)',
    },
    'EVOLUCAO_EMOCIONAL_E_NARRATIVA.txt': {
      descricao: 'Seguir o crescimento emocional sem reiniciar tom',
      regra: 'nivel>=2',
    },
    'ESTRUTURA_NARRATIVA_VARIAVEL.txt': {
      descricao: 'Variar forma conforme o momento',
      regra: 'nivel>=2',
    },
    'HEURISTICA_EXAUSTAO.txt': {
      descricao: 'Ativar em quadros de sobrecarga/exaustão',
      regra: 'intensidade>=7',
    },
    'SITUACOES_ESPECIFICAS.txt': {
      descricao: 'Usar em pedidos práticos/temas objetivos',
      regra: 'pedido_pratico==true',
    },
    'BLOCO_TECNICO_MEMORIA.txt': {
      descricao: 'Gerar memória técnica apenas em emoção intensa',
      regra: 'intensidade>=7 && nivel>=2',
    },
    'VARIEDADE_FORMA_TOM.txt': {
      descricao: 'Playbook de forma e tom (só quando há abertura real)',
      regra: 'nivel>=2',
    },
    // ⬇️ disponível desde NV1 (conteúdo do módulo já orienta quando usar)
    'CRITERIO_ENCERRAMENTO_SENSIVEL.txt': {
      descricao: 'Encerrar com presença e continuidade quando o campo pede pausa/assentimento',
      regra: 'nivel>=1',
    },
  },

  // ===== PRIORIZAÇÃO DE BUDGET =====
  limites: {
    prioridade: [
      // 🔝 NÚCLEO ESSENCIAL (nunca cortar)
      'PRINCIPIOS_CHAVE.txt',
      'IDENTIDADE.txt',
      'ECO_ESTRUTURA_DE_RESPOSTA.txt',
      'POLITICA_REDIRECIONAMENTO.txt',
      'CRITERIO_ENCERRAMENTO_SENSIVEL.txt', // ✅ priorizado no núcleo

      // 🔝 ORQUESTRADORES (protegidos)
      'ECO_ORQUESTRA_NIVEL1.txt',
      'ECO_ORQUESTRA_NIVEL2.txt',
      'ECO_ORQUESTRA_NIVEL3.txt',

      // 🎯 MODULAÇÃO E CONTEXTO (alta prioridade)
      'MODULACAO_TOM_REGISTRO.txt',
      'CONTEXTO_EMOCIONAL.txt',

      // ⚕️ MÓDULOS DE REGULAÇÃO (entram via triggers)
      'ORIENTACAO_GROUNDING.txt',
      'RESPIRACAO_GUIADA_BOX.txt',
      'DR_DISPENZA_BENCAO_CENTROS_LITE.txt',

      // 🔄 CONTINUIDADE E ADAPTAÇÃO
      'CONTINUIDADE_EMOCIONAL.txt',
      'CRITERIO_SUFICIENCIA_REFLEXIVA.txt',
      'ADAPTACAO_CULTURAL_LINGUISTICA.txt',
      'VARIEDADE_FORMA_TOM.txt',

      // 🎨 NARRATIVA E EXPLORAÇÃO
      'CONVITE_PARA_EXPLORACAO.txt',
      'IDENTIFICACAO_PADROES.txt',
      'META_REFLEXAO.txt',
      'NARRATIVA_SOFISTICADA.txt',
      'ESTRUTURA_NARRATIVA_VARIAVEL.txt',
      'EVOLUCAO_EMOCIONAL_E_NARRATIVA.txt',
      'EVOLUCAO_NIVEL_ABERTURA.txt',

      // 📚 INFORMATIVO E INTERATIVO
      'MOVIMENTOS_INFORMATIVOS.txt',
      'PERGUNTAS_ABERTAS.txt',
      'METODO_VIVA.txt',
      'HEURISTICA_EXAUSTAO.txt',
      'SITUACOES_ESPECIFICAS.txt',

      // 💾 MEMÓRIAS (podem ser cortadas em budget apertado)
      'MEMORIAS_NO_CONTEXTO.txt',
      'MEMORIAS_REFERENCIAS_CONTEXTO.txt',
      'REVIVER_MEMORIAS.txt',
      'ESCALA_INTENSIDADE.txt',
      'BLOCO_TECNICO_MEMORIA.txt',
    ],
  },
};

// ===== HELPER FUNCTIONS =====

export function resolveModulesForLevel(
  nivel: number,
  matriz: MatrizPromptBaseV2,
): string[] {
  const levelConfig = matriz.byNivelV2[nivel as Nivel];
  if (!levelConfig) {
    return [...(matriz.alwaysInclude || []), ...(matriz.byNivel[nivel] || [])];
  }
  const inherited = levelConfig.inherits.flatMap(
    (category) => matriz.baseModules[category as Camada] || [],
  );
  return [...new Set([...inherited, ...levelConfig.specific])];
}

export function resolveModulesLegacy(nivel: number, matriz: MatrizPromptBase): string[] {
  return [...(matriz.alwaysInclude || []), ...(matriz.byNivel[nivel] || [])];
}

// ===== VALIDAÇÃO =====
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalModules: number;
    modulesByLevel: Record<number, number>;
    duplicatesRemoved: number;
  };
}

export function validateMatrix(matriz: MatrizPromptBaseV2): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats = {
    totalModules: 0,
    modulesByLevel: {} as Record<number, number>,
    duplicatesRemoved: 0,
  };

  for (const nivel of [1, 2, 3] as const) {
    const legacyModules = resolveModulesLegacy(nivel, matriz);
    const newModules = resolveModulesForLevel(nivel, matriz);

    stats.modulesByLevel[nivel] = newModules.length;
    stats.totalModules += newModules.length;

    const legacySet = new Set(legacyModules);
    const newSet = new Set(newModules);

    const onlyInLegacy = [...legacySet].filter((m) => !newSet.has(m));
    const onlyInNew = [...newSet].filter((m) => !legacySet.has(m));

    if (onlyInLegacy.length > 0) {
      warnings.push(`Nível ${nivel}: módulos apenas no sistema antigo: ${onlyInLegacy.join(', ')}`);
    }
    if (onlyInNew.length > 0) {
      warnings.push(`Nível ${nivel}: módulos apenas no sistema novo: ${onlyInNew.join(', ')}`);
    }

    const duplicates = legacyModules.length - new Set(legacyModules).size;
    stats.duplicatesRemoved += Math.max(0, duplicates);
  }

  const allModules = new Set<string>([
    ...matriz.alwaysInclude,
    ...Object.values(matriz.byNivel).flat(),
    ...Object.values(matriz.baseModules).flat(),
  ]);

  for (const module of Object.keys(matriz.intensidadeMinima)) {
    if (!allModules.has(module)) {
      errors.push(`Módulo '${module}' em intensidadeMinima não encontrado`);
    }
  }

  for (const module of Object.keys(matriz.condicoesEspeciais)) {
    if (!allModules.has(module)) {
      errors.push(`Módulo '${module}' em condicoesEspeciais não encontrado`);
    }
  }

  return { isValid: errors.length === 0, errors, warnings, stats };
}
