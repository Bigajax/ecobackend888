export interface CondicaoEspecial {
  descricao: string;
  regra: string; // variáveis disponíveis: nivel, intensidade, curiosidade, pedido_pratico, duvida_classificacao
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

export const matrizPromptBase: MatrizPromptBase = {
  // Núcleo mínimo e transversal (sem NV1 aqui)
  alwaysInclude: [
    'PRINCIPIOS_CHAVE.txt',
    'IDENTIDADE.txt',
    'ECO_ESTRUTURA_DE_RESPOSTA.txt',
    'POLITICA_REDIRECIONAMENTO.txt'
    // REMOVIDO: 'MEMORIAS_NO_CONTEXTO.txt' (já anexado no final pelo montarContextoEco)
  ],

  // Mapeamentos por nível (inclui 1 → apenas o orquestrador do NV1)
  byNivel: {
    1: ['ECO_ORQUESTRA_NIVEL1.txt'],
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
      'NARRATIVA_SOFISTICADA.txt'
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
      'NARRATIVA_SOFISTICADA.txt'
    ]
  },

  // Gating barato por intensidade
  intensidadeMinima: {
    'BLOCO_TECNICO_MEMORIA.txt': 7,
    'ESCALA_INTENSIDADE.txt': 7,
    'METODO_VIVA.txt': 7,
    'HEURISTICA_EXAUSTAO.txt': 7
  },

  // Regras semânticas
  condicoesEspeciais: {
    'METODO_VIVA.txt': {
      descricao: 'Ativar apenas em emoção forte e abertura real',
      regra: 'intensidade>=7 && nivel>=2'
    },
    'META_REFLEXAO.txt': {
      descricao: 'Só quando há material emocional para investigar processo',
      regra: 'intensidade>=6 && nivel>=2'
    },
    'CONVITE_PARA_EXPLORACAO.txt': {
      descricao: 'Abrir espaço com cuidado quando já há movimento emocional',
      regra: 'intensidade>=5 && nivel>=2'
    },
    'IDENTIFICACAO_PADROES.txt': {
      descricao: 'Apontar padrões apenas com abertura suficiente',
      regra: 'intensidade>=5 && nivel>=2'
    },
    'NARRATIVA_SOFISTICADA.txt': {
      descricao: 'Usar cadência/imagens suaves só se houver campo',
      regra: 'intensidade>=5 && nivel>=2'
    },
    'MOVIMENTOS_INFORMATIVOS.txt': {
      descricao: 'Explicações/insights curtos só com curiosidade/pedido',
      regra: 'nivel>=2 && (curiosidade==true || pedido_pratico==true)'
    },
    'PERGUNTAS_ABERTAS.txt': {
      descricao: 'Perguntas fenomenológicas quando há abertura clara',
      regra: 'nivel==3 || (nivel==2 && curiosidade==true)'
    },
    'EVOLUCAO_NIVEL_ABERTURA.txt': {
      descricao: 'Acompanhar mudança de abertura durante a sessão',
      regra: 'nivel==3 || (nivel==2 && intensidade>=6)'
    },
    'EVOLUCAO_EMOCIONAL_E_NARRATIVA.txt': {
      descricao: 'Seguir o crescimento emocional sem reiniciar tom',
      regra: 'nivel>=2'
    },
    'ESTRUTURA_NARRATIVA_VARIAVEL.txt': {
      descricao: 'Variar forma conforme o momento',
      regra: 'nivel>=2'
    },
    'HEURISTICA_EXAUSTAO.txt': {
      descricao: 'Ativar em quadros de sobrecarga/exaustão',
      regra: 'intensidade>=7'
    },
    'SITUACOES_ESPECIFICAS.txt': {
      descricao: 'Usar em pedidos práticos/temas objetivos',
      regra: 'pedido_pratico==true'
    },
    'BLOCO_TECNICO_MEMORIA.txt': {
      descricao: 'Gerar memória técnica apenas em emoção intensa',
      regra: 'intensidade>=7 && nivel>=2'
    }
  },

  // Ordem de prioridade sob budget
  limites: {
    prioridade: [
      'PRINCIPIOS_CHAVE.txt',
      'IDENTIDADE.txt',
      'ECO_ESTRUTURA_DE_RESPOSTA.txt',
      'POLITICA_REDIRECIONAMENTO.txt',

      // 🔝 Orquestradores no topo para não serem cortados
      'ECO_ORQUESTRA_NIVEL1.txt',
      'ECO_ORQUESTRA_NIVEL2.txt',
      'ECO_ORQUESTRA_NIVEL3.txt',

      'MODULACAO_TOM_REGISTRO.txt',
      'CONTEXTO_EMOCIONAL.txt',

      // Módulos de Regulação (entram via triggers/modReg)
      'ORIENTACAO_GROUNDING.txt',
      'RESPIRACAO_GUIADA_BOX.txt',
      'DR_DISPENZA_BENCAO_CENTROS_LITE.txt',

      'CONTINUIDADE_EMOCIONAL.txt',
      'CRITERIO_SUFICIENCIA_REFLEXIVA.txt',
      'ADAPTACAO_CULTURAL_LINGUISTICA.txt',
      'VARIEDADE_FORMA_TOM.txt',

      'CONVITE_PARA_EXPLORACAO.txt',
      'IDENTIFICACAO_PADROES.txt',
      'META_REFLEXAO.txt',
      'NARRATIVA_SOFISTICADA.txt',
      'ESTRUTURA_NARRATIVA_VARIAVEL.txt',
      'EVOLUCAO_EMOCIONAL_E_NARRATIVA.txt',
      'EVOLUCAO_NIVEL_ABERTURA.txt',

      'MOVIMENTOS_INFORMATIVOS.txt',
      'PERGUNTAS_ABERTAS.txt',
      'METODO_VIVA.txt',
      'HEURISTICA_EXAUSTAO.txt',
      'SITUACOES_ESPECIFICAS.txt',

      // Memórias — não entram no alwaysInclude; mantidas na prioridade
      'MEMORIAS_NO_CONTEXTO.txt',
      'MEMORIAS_REFERENCIAS_CONTEXTO.txt',
      'REVIVER_MEMORIAS.txt',
      'ESCALA_INTENSIDADE.txt',
      'BLOCO_TECNICO_MEMORIA.txt'
    ]
  }
};
