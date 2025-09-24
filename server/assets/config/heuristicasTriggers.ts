/* assets/config/heuristicasTriggers.ts
   ──────────────────────────────────────────
   Notas:
   - Gatilhos em ASCII (sem acento) para casar com normalizar().
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
      "nunca vai ser igual",
      "naquela epoca",
      "naquele tempo",
      "depois do que aconteceu",
      "nao aceito menos",
      "regra do passado",
      "vivi meu auge",
      "ficou marcado",
      "vivo do passado",
      "comparando com o passado",
      "so comparo com antes"
    ]
  },

  // ── Causas > estatisticas: caso unico vence dados gerais
  {
    arquivo: "eco_heuristica_causas_superam_estatisticas.txt",
    gatilhos: [
      "aconteceu comigo",
      "eu vivi isso",
      "no meu caso",
      "e diferente comigo",
      "conheco uma pessoa",
      "um exemplo prova",
      "um caso prova",
      "estatistica nao importa",
      "estatistica nao serve",
      "ignora estatistica",
      "exemplo marcante",
      "caso marcante",
      "sempre acontece assim",
      "logo e 100 por cento",
      "taxa base",
      "extrapolacao por exemplo",
      "vi acontecer entao e verdade"
    ]
  },

  // ── Disponibilidade: frequencia aparente pela exposicao
  {
    arquivo: "eco_heuristica_disponibilidade.txt",
    gatilhos: [
      "so lembro das vezes",
      "isso acontece o tempo todo",
      "toda hora acontece",
      "toda vez acontece",
      "sempre acontece",
      "sempre foi assim",
      "ultimamente so isso acontece",
      "aconteceu de novo",
      "lembro das vezes que falhei",
      "so lembro do que doeu",
      "o que vem na cabeca",
      "o que aparece primeiro",
      "o que mais aparece"
    ]
  },

  // ── Excesso de confianca: certeza sem base suficiente
  {
    arquivo: "eco_heuristica_excesso_confianca.txt",
    gatilhos: [
      "eu sei exatamente quem eu sou",
      "eu ja entendi tudo",
      "ja entendi tudo",
      "sempre vai ser assim",
      "vai ser sempre assim",
      "eu ja conheco esse ciclo",
      "ja conheco esse ciclo",
      "tenho certeza do que vai acontecer",
      "eu tenho certeza absoluta",
      "nao tenho duvidas sobre isso",
      "isso e um fato",
      "eu estou 100 por cento certo",
      "100 por cento certo",
      "100% certo",
      "eu ja vi isso mil vezes",
      "sempre igual"
    ]
  },

  // ── Certeza emocional: parecer evidente por coerencia afetiva
  {
    arquivo: "eco_heuristica_certeza_emocional.txt",
    gatilhos: [
      "eu tenho certeza",
      "tenho certeza",
      "com certeza",
      "eu ja sei como termina",
      "eu ja sei como isso vai acabar",
      "sempre e assim",
      "e sempre assim",
      "nunca falha",
      "isso e um fato",
      "e fato",
      "nao tem duvida",
      "e obvio",
      "eu sei exatamente",
      "vai ser assim",
      "vai dar errado de novo",
      "todos fazem isso",
      "ninguem muda",
      "todo mundo e assim"
    ]
  },

  // ── Ilusao de validade: narrativa soa coerente, logo esta certa
  {
    arquivo: "eco_heuristica_ilusao_validade.txt",
    gatilhos: [
      "tenho certeza",
      "certeza absoluta",
      "nao tenho duvidas",
      "estava tudo indicando isso",
      "todos os sinais mostravam",
      "nao tem como dar errado",
      "vai dar certo com certeza",
      "minha intuicao nunca falha",
      "minha leitura sempre acerta",
      "eu sei ler as pessoas",
      "eu sempre acerto",
      "eu ja conheco esse padrao",
      "ja conheco esse padrao",
      "isso e um fato",
      "100 por cento certo",
      "100% certo"
    ]
  },

  // ── Intuicao do especialista: autoridade sem feedback robusto
  {
    arquivo: "eco_heuristica_intuicao_especialista.txt",
    gatilhos: [
      "especialista confiavel",
      "mentor experiente",
      "autoridade no assunto",
      "muito experiente",
      "experiencia dele",
      "experiencia dela",
      "ele sempre acerta",
      "ela sempre acerta",
      "acerta sempre",
      "nunca erra",
      "sente essas coisas",
      "tem intuicao apurada",
      "ele sabe das coisas",
      "ela sabe das coisas",
      "confio porque acerta",
      "historico de acertos",
      "segui a intuicao dele",
      "segui a intuicao dela"
    ]
  },

  // ── Regressao a media: picos/vales seguidos de retorno natural
  {
    arquivo: "eco_heuristica_regressao_media.txt",
    gatilhos: [
      "depois do pico caiu",
      "queda de desempenho",
      "caiu desempenho",
      "desandou depois",
      "regredi no desempenho",
      "voltei ao normal",
      "voltei a piorar",
      "um erro prova tudo",
      "um erro mostra tudo",
      "perdi a mao",
      "foi so sorte",
      "foi so azar",
      "depois do elogio errei",
      "uma critica define",
      "um elogio define",
      "um dia otimo outro pessimo",
      "montanha russa",
      "estava indo bem e falhei",
      "tudo desmoronou",
      "nada mais funciona"
    ]
  },

  // ── Ilusao de compreensao do passado (hindsight)
  {
    arquivo: "eco_heuristica_ilusao_compreensao_passado.txt",
    gatilhos: [
      "eu sabia que ia dar errado",
      "eu sabia que ia dar certo",
      "era obvio",
      "sempre foi obvio",
      "ficou claro depois",
      "dava para prever",
      "todo mundo sabia",
      "estava escrito",
      "inevitavel",
      "so podia acabar assim",
      "ele sempre foi um fracassado",
      "ela conseguiu porque e perfeita",
      "sempre foi assim",
      "agora faz todo sentido",
      "olhando agora era claro",
      "no fundo eu sempre soube",
      "resultado mostrou quem ele e",
      "resultado mostrou quem eu sou"
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
    "disponibilidade", "memoria_viva"
  ],
  "eco_heuristica_excesso_confianca.txt": [
    "excesso_confianca", "certeza", "conviccao_rigida"
  ],
  "eco_heuristica_certeza_emocional.txt": [
    "certeza_emocional", "coerencia_narrativa", "conviccao_rapida"
  ],
  "eco_heuristica_ilusao_validade.txt": [
    "ilusao_validade", "validacao_subjetiva", "superconfianca", "feedback_limitado"
  ],
  "eco_heuristica_intuicao_especialista.txt": [
    "intuicao_especialista", "autoridade_confianca", "ambiente_instavel", "feedback_ausente"
  ],
  "eco_heuristica_regressao_media.txt": [
    "regressao_media", "oscilacao", "volta_normal"
  ],
  "eco_heuristica_ilusao_compreensao_passado.txt": [
    "ilusao_compreensao", "narrativa_passado", "certeza_excessiva", "explicacao_causal_simples"
  ]
};
