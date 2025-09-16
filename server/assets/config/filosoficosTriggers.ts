/* assets/config/filosoficosTriggers.ts */

export interface ModuloFilosoficoTrigger {
  arquivo: string;
  gatilhos: string[];
}

export const filosoficosTriggerMap: ModuloFilosoficoTrigger[] = [
  // Corpo como via de presenca
  {
    arquivo: "eco_corpo_emocao.txt",
    gatilhos: [
      "aperto no peito",
      "peito apertado",
      "dor no peito",
      "no na garganta",
      "aperto na garganta",
      "tensao no corpo",
      "tremor no corpo",
      "sinto no corpo",
      "nao sinto meu corpo",
      "dormencia no corpo",
      "respiracao curta",
      "falta de ar"
    ]
  },

  // Observador presente / meta-consciencia
  {
    arquivo: "eco_observador_presente.txt",
    gatilhos: [
      "observar sem julgar",
      "me observar melhor",
      "percebo meus pensamentos",
      "vejo meus pensamentos",
      "ver de fora",
      "eu noto agora",
      "consciencia do agora",
      "presenciar o que sinto",
      "olhar para dentro",
      "testemunhar a emocao"
    ]
  },

  // Desidentificacao da mente
  {
    arquivo: "eco_identificacao_mente.txt",
    gatilhos: [
      "minha mente nao para",
      "penso demais",
      "loop mental",
      "ruminacao",
      "preso na cabeca",
      "sou meus pensamentos",
      "vozes na cabeca",
      "historia sobre mim",
      "rotulos sobre mim",
      "confusao mental",
      "mente acelerada",
      "briga interna"
    ]
  },

  // Presenca silenciosa / quietude
  {
    arquivo: "eco_presenca_silenciosa.txt",
    gatilhos: [
      "preciso de silencio",
      "quero ficar em silencio",
      "mente barulhenta",
      "quero so silencio",
      "pausa para respirar",
      "ficar quieto um momento",
      "quietude",
      "silencio interior",
      "descanso profundo"
    ]
  },

  // Sofrimento x realidade (aceitacao)
  {
    arquivo: "eco_fim_do_sofrimento.txt",
    gatilhos: [
      "lutar contra a realidade",
      "resistencia ao que e",
      "pioro com meus pensamentos",
      "dor e sofrimento",
      "cansado de sofrer",
      "nao aguento mais",
      "sofrimento sem fim",
      "quero que pare de doer",
      "nao sei como sair disso"
    ]
  }
];
