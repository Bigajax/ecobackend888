// assets/config/estoicosTriggers.ts
export interface ModuloEstoicoTrigger {
  arquivo: string;
  gatilhos: string[];
}

// ⚠️ Os comparadores no Selector já normalizam (lowercase + sem acento).
// Mantenha aqui também em lowercase/sem acentos para reduzir ruído.

export const estoicosTriggerMap: ModuloEstoicoTrigger[] = [
  // Presença racional / dicotomia do controle
  {
    arquivo: "eco_presenca_racional.txt",
    gatilhos: [
      "fora do meu controle", "controlar tudo", "incontrolavel",
      "aceitar o presente", "nao consigo estar presente",
      "remoo o passado", "ansioso com o futuro",
      "o que os outros pensam", "comparando com os outros",
      "me culpo por coisas fora",
      "pressa", "raiva", "frustracao", "medo de julgamento",
      "ser reconhecido", "validacao externa", "aprovacao",
      "autocritica", "ansiedade do futuro", "antecipacao",
      "perdi o controle", "nao controlo", "me tirar do serio",
      "me irrita", "me deixa ansioso", "inquieto", "inquietacao"
    ]
  },

  // Observador presente / meta-consciência
  {
    arquivo: "eco_observador_presente.txt",
    gatilhos: [
      "observar sem julgar", "observar minhas emocoes",
      "consciencia do que sinto", "reagindo automaticamente",
      "pensamentos se repetem", "ficar presente comigo",
      "respirar e perceber", "quero me observar melhor",
      "voltar pro agora", "acalmar a mente",
      "mente acelerada", "ruminacao", "overthinking",
      "testemunha interna", "ser o observador"
    ]
  },

  // Desidentificação da mente
  {
    arquivo: "eco_identificacao_mente.txt",
    gatilhos: [
      "preso na cabeca", "sou meus pensamentos",
      "historia que conto sobre mim", "rotulos sobre mim",
      "narrativa sobre mim", "sou assim mesmo",
      "sempre fui fracassado", "sou fracassado",
      "nao presto", "sempre fui assim", "nao consigo mudar",
      "pensamento acelerado", "muita cabeca", "muitos pensamentos",
      "me julgo demais", "auto julgamento", "pensamentos confusos",
      "minha mente nao para"
    ]
  },

  // Corpo como via de presença (sensações)
  {
    arquivo: "eco_corpo_emocao.txt",
    gatilhos: [
      "peito apertado", "aperto no peito", "no na garganta",
      "formigamento", "tremor no corpo", "sem sentir o corpo",
      "dormencia no corpo", "sinto no corpo",
      "respiracao curta", "falta de ar", "palpitacao",
      "coracao acelerado", "suor frio", "nausea",
      "no estomago", "barriga travada",
      "ombros tensos", "mandibula tensa",
      "nao sei o que sinto", "tudo embaralhado"
    ]
  },

  // Sofrimento x realidade (aceitação sem resistência)
  {
    arquivo: "eco_fim_do_sofrimento.txt",
    gatilhos: [
      "lutar contra a realidade", "resistencia ao que e",
      "pioro com meus pensamentos", "dor e sofrimento",
      "cansado de sofrer", "sofrer", "sofrimento",
      "a dor nao passa", "nao aguento mais", "quero que a dor acabe",
      "sem forcas", "tudo doi", "virou meu normal",
      "nao sei como escapar"
    ]
  }
];
