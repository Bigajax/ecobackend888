export interface ModuloEstoicoTrigger {
  arquivo: string;
  gatilhos: string[];
}

export const estoicosTriggerMap: ModuloEstoicoTrigger[] = [
  // Dicotomia do controle / aceitação racional
  {
    arquivo: "eco_presenca_racional.txt",
    gatilhos: [
      "fora do meu controle",
      "controlar tudo",
      "tento controlar o incontrolavel",
      "aceitar o presente",
      "nao consigo estar presente",
      "pressa e ansiedade",
      "remoendo o passado",
      "ansioso com o futuro",
      "o que os outros pensam",
      "comparando com os outros",
      "me culpo por coisas fora"
    ]
  },

  // Observador presente / meta-consciência
  {
    arquivo: "eco_observador_presente.txt",
    gatilhos: [
      "observar sem julgar",
      "observar minhas emocoes",
      "consciencia do que sinto",
      "me pego reagindo automaticamente",
      "pensamentos se repetem",
      "ficar presente comigo",
      "respirar e perceber",
      "quero me observar melhor"
    ]
  },

  // Desidentificação da mente
  {
    arquivo: "eco_identificacao_mente.txt",
    gatilhos: [
      "preso na cabeca",
      "minha mente nao para",
      "sou meus pensamentos",
      "historia que conto sobre mim",
      "rotulos sobre mim",
      "narrativa sobre mim"
    ]
  },

  // Corpo como via de presença (sensações)
  {
    arquivo: "eco_corpo_emocao.txt",
    gatilhos: [
      "peito apertado",
      "no na garganta",
      "sinto no corpo",
      "tremor no corpo",
      "nao sinto nada no corpo",
      "dormencia no corpo"
    ]
  },

  // Silêncio / quietude
  {
    arquivo: "eco_presenca_silenciosa.txt",
    gatilhos: [
      "mente barulhenta",
      "preciso de silencio",
      "quero ficar em silencio",
      "pausa para respirar",
      "ficar quieto um momento"
    ]
  },

  // Sofrimento x realidade (estoico)
  {
    arquivo: "eco_fim_do_sofrimento.txt",
    gatilhos: [
      "lutar contra a realidade",
      "resistencia ao que e",
      "pioro com meus pensamentos",
      "dor e sofrimento",
      "sofrimento nasce da resistencia"
    ]
  }
];
