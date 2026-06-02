// services/promptContext/triggers/emocionaisTriggers.ts

export interface ModuloEmocionalTrigger {
  arquivo: string;
  gatilhos: string[];
  relacionado?: string[];
  tags?: string[];
  emocoes?: string[];
  intensidadeMinima?: number;
}

export const emocionaisTriggerMap: ModuloEmocionalTrigger[] = [
  {
    arquivo: "eco_vulnerabilidade_mitos.txt",
    intensidadeMinima: 3, // ativa de leve pra cima
    gatilhos: [
      "vulnerabilidade e fraqueza",
      "nao posso demonstrar fraqueza",
      "tenho que ser forte sempre",
      "mostrar sentimento e fraqueza",
      "nao posso chorar",
      "preciso manter controle",
      "tenho que me proteger sempre",
      "se eu me abrir vou ser julgado",
      "medo de me expor",
      "prefiro nao sentir"
    ],
    tags: ["vulnerabilidade", "armadura", "medo_de_julgamento", "controle", "pertencimento"],
    emocoes: ["medo", "vergonha", "ansiedade"],
    relacionado: ["eco_corpo_emocao.txt", "eco_identificacao_mente.txt"]
  },

  {
    arquivo: "eco_emo_vergonha_combate.txt",
    intensidadeMinima: 4, // ativa a partir de moderado
    gatilhos: [
      "tenho vergonha",
      "sinto vergonha",
      "medo de julgamento",
      "medo de ser rejeitado",
      "vao descobrir",
      "sou um fracasso",
      "sou uma decepcao",
      "sou defeituoso",
      "sou errado",
      "nao sou bom o bastante",
      "nao pertenco",
      "me sinto indigno"
    ],
    tags: ["vergonha", "inadequacao", "rejeicao", "autoimagem", "pertencimento"],
    emocoes: ["vergonha", "culpa"],
    relacionado: ["eco_vulnerabilidade_mitos.txt"]
  },

  {
    arquivo: "eco_vulnerabilidade_defesas.txt",
    intensidadeMinima: 4, // pode entrar até em alta se fizer sentido
    gatilhos: [
      "me fecho",
      "nao mostro o que sinto",
      "sempre forte",
      "nao posso demonstrar fraqueza",
      "evito sentir",
      "fugir da emocao",
      "so trabalho",
      "produtividade sem parar",
      "perfeccionista",
      "preciso ser perfeito",
      "autodepreciacao",
      "me diminuo antes",
      "eu me saboto",
      "me escondo",
      "medo de me expor",
      "culpo os outros",
      "ataco antes",
      "defendo antes"
    ],
    tags: ["defesas", "vulnerabilidade", "perfeccionismo", "evitamento", "autoprotecao"],
    emocoes: ["medo", "vergonha", "ansiedade"],
    relacionado: ["eco_vulnerabilidade_mitos.txt", "eco_corpo_emocao.txt"]
  }
];
