  export interface CondicaoEspecial {
    descricao: string;
    regra: string;
  }

  export interface MatrizPromptBase {
    alwaysInclude: string[];
    byNivel: Record<number, string[]>;
    intensidadeMinima: Record<string, number>;
    condicoesEspeciais: Record<string, CondicaoEspecial>;
  }

  export const matrizPromptBase: MatrizPromptBase = {
    alwaysInclude: [
      'PRINCIPIOS_CHAVE.txt',
      'IDENTIDADE.txt',
      'REGRA_SAUDACAO.txt',
      'ECO_ESTRUTURA_DE_RESPOSTA.txt',
      'POLITICA_REDIRECIONAMENTO.txt',
      'MEMORIAS_NO_CONTEXTO.txt'   // ✅ Adicionado aqui
    ],
    byNivel: {
      2: [
        'CONTEXTO_EMOCIONAL.txt',
        'MOVIMENTOS_INFORMATIVOS.txt',
        'METODO_VIVA.txt',
        'MODULACAO_TOM_REGISTRO.txt',
        'CONTINUIDADE_EMOCIONAL.txt',
        'CRITERIO_SUFICIENCIA_REFLEXIVA.txt',
        'ADAPTACAO_CULTURAL_LINGUISTICA.txt',
        'VARIEDADE_FORMA_TOM.txt'
      ],
      3: [
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
        'ESCALA_INTENSIDADE.txt'
      ]
    },
    intensidadeMinima: {
      'BLOCO_TECNICO_MEMORIA.txt': 7,
      'ESCALA_INTENSIDADE.txt': 7
    },
    condicoesEspeciais: {
    'METODO_VIVA.txt': {
      descricao: "Só incluir se intensidade >= 7 e abertura emocional = 2 ou 3",
      regra: "intensidade>=7 && (nivel==2 || nivel==3)"
    }
  }
  };
