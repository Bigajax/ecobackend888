/* assets/config/heuristicasTriggers.ts
   ──────────────────────────────────────────
   Notas:
   - Gatilhos em ascii (sem acento) para casar com normalizarTexto().
   - 2+ palavras por gatilho para reduzir falso-positivo.
   - Foco em n-grams comuns em conversa real.
*/

export interface HeuristicaTrigger {
  arquivo: string;
  gatilhos: string[];
}

/* ───────── Heurísticas + frases-gatilho ───────── */
export const heuristicasTriggerMap: HeuristicaTrigger[] = [
  // ── Ancoragem: fixar referencia passada "melhor" / "antes"
  {
    arquivo: "eco_heuristica_ancoragem.txt",
    gatilhos: [
      "antes era melhor",
      "nada se compara",
      "ja estive bem",
      "nao aceito menos",
      "depois do que aconteceu"
    ]
  },

  // ── Causas > estatisticas: caso unico vence dados gerais
  {
    arquivo: "eco_heuristica_causas_superam_estatisticas.txt",
    gatilhos: [
      "aconteceu comigo",
      "eu vivi isso",
      "mas no meu caso",
      "e diferente comigo",
      "sei que parece raro"
    ]
  },

  // ── Disponibilidade: frequencia aparente pela exposicao
  {
    arquivo: "eco_heuristica_disponibilidade.txt",
    gatilhos: [
      "acabei de ver",
      "todo mundo fala",
      "esta em todo lugar",
      "nao se fala de outra coisa"
    ]
  },

  // ── Disponibilidade + emocao/risco: catastrofizacao por lembranca viva
  {
    arquivo: "eco_heuristica_disponibilidade_emocao_risco.txt",
    gatilhos: [
      "tenho medo de tentar",
      "sempre da errado",
      "ja sofri demais",
      "vai dar problema",
      "vou quebrar a cara"
    ]
  },

  // ── Excesso de confianca: certeza sem base suficiente
  {
    arquivo: "eco_heuristica_excesso_confianca.txt",
    gatilhos: [
      "nao tem como dar errado",
      "certeza absoluta",
      "cem por cento garantido",
      "impossivel falhar"
    ]
  },

  // ── Certeza emocional: parecer evidente por coerencia afetiva
  {
    arquivo: "eco_heuristica_certeza_emocional.txt",
    gatilhos: [
      "claramente certo",
      "ja esta decidido",
      "e evidente",
      "eu tinha certeza",
      "tudo confirmava",
      "era obvio demais",
      "nao podia estar enganado",
      "intuicao dizia isso",
      "estava tudo alinhado",
      "parecia que era pra ser"
    ]
  },

  // ── Ilusao de validade: narrativa soa coerente, logo esta certa
  {
    arquivo: "eco_heuristica_ilusao_validade.txt",
    gatilhos: [
      "so podia ser isso",
      "confianca absoluta",
      "e a unica explicacao",
      "esta tudo se encaixando",
      "nao tenho mais duvidas",
      "sei exatamente onde isso vai parar",
      "claro como o dia",
      "nao tem como ser diferente",
      "eu sinto isso com muita forca"
    ]
  },

  // ── Lei dos pequenos numeros: generalizar por amostra minima
  {
    arquivo: "eco_heuristica_lei_pequenos_numeros.txt",
    gatilhos: [
      "funcionou tres vezes",
      "so precisei de dois casos",
      "com pouca amostra deu certo",
      "amostra muito pequena"
    ]
  },

  // ── Regressao a media: picos tendem a normalizar (lido como perda/culpa)
  {
    arquivo: "eco_heuristica_regressao_media.txt",
    gatilhos: [
      "perdi a mao",
      "pior que antes",
      "nunca consigo manter",
      "desandou de novo",
      "deve ter sido sorte"
    ]
  },

  // ── Base-rate/causalidade aparente: ignora taxa base e estereotipa
  {
    arquivo: "eco_heuristica_taxabase_causal.txt",
    gatilhos: [
      "so acontece ali",
      "sempre esse grupo",
      "gente desse tipo e assim",
      "ja sei como esse pessoal e"
    ]
  },

  // ── Intuicao do especialista: autoridade sem feedback robusto
  {
    arquivo: "eco_heuristica_intuicao_especialista.txt",
    gatilhos: [
      "ele sempre acerta",
      "ela tem um feeling",
      "a experiencia dele basta",
      "nao tem como ela errar",
      "confio no faro dele",
      "segui o que ele sentiu"
    ]
  },

  // ── Ilusao de compreensao (hindsight): ja era obvio depois que aconteceu
  {
    arquivo: "heuristica_ilusao_compreensao.txt",
    gatilhos: [
      "eu sabia que ia dar errado",
      "era obvio demais",
      "claro que isso ia acontecer",
      "sempre soube disso",
      "ja dava pra ver",
      "estava na cara",
      "todo mundo dizia",
      "nao era surpresa",
      "ja esperava por isso"
    ]
  },

  // ── Previsao regressiva: extrapola linha reta (otimismo/pessimismo)
  {
    arquivo: "heuristica_previsao_regressiva.txt",
    gatilhos: [
      "vai explodir de crescer",
      "isso vai bombar",
      "certeza de sucesso",
      "vai fracassar com certeza",
      "nada vai segurar isso"
    ]
  }
];

/* ───────── Tags associadas a cada heurística ───────── */
export const tagsPorHeuristica: Record<string, string[]> = {
  "eco_heuristica_ancoragem.txt": [
    "ancoragem", "comparacao_passado", "referencia_fixa"
  ],
  "eco_heuristica_causas_superam_estatisticas.txt": [
    "caso_unico", "estatistica_ignore", "historia_forte"
  ],
  "eco_heuristica_disponibilidade.txt": [
    "disponibilidade", "repeticao_midia"
  ],
  "eco_heuristica_disponibilidade_emocao_risco.txt": [
    "disponibilidade_risco", "medo", "memoria_viva"
  ],
  "eco_heuristica_excesso_confianca.txt": [
    "excesso_confianca", "certeza", "arrogancia"
  ],
  "eco_heuristica_certeza_emocional.txt": [
    "certeza_emocional", "coerencia_narrativa", "conviccao_rapida"
  ],
  "eco_heuristica_ilusao_validade.txt": [
    "ilusao_validade", "validacao_subjetiva", "superconfianca", "feedback_limitado"
  ],
  "eco_heuristica_lei_pequenos_numeros.txt": [
    "pequena_amostra", "lei_numeros", "generalizacao"
  ],
  "eco_heuristica_regressao_media.txt": [
    "regressao_media", "sorte", "volta_normal"
  ],
  "eco_heuristica_taxabase_causal.txt": [
    "taxabase", "estereotipo", "causalidade_aparente"
  ],
  "eco_heuristica_intuicao_especialista.txt": [
    "intuicao_especialista", "autoridade_confianca", "ambiente_instavel", "feedback_ausente"
  ],
  "heuristica_ilusao_compreensao.txt": [
    "ilusao_compreensao", "narrativa_passado", "certeza_excessiva", "explicacao_causal_simples"
  ],
  "heuristica_previsao_regressiva.txt": [
    "previsao_regressiva", "super_otimismo", "super_pessimismo"
  ]
};
