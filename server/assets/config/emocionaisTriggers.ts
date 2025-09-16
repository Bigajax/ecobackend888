export interface ModuloEmocionalTrigger {
  arquivo: string;
  gatilhos: string[];
  relacionado?: string[];
  tags?: string[];
  intensidadeMinima?: number;
}

export const emocionaisTriggerMap: ModuloEmocionalTrigger[] = [
  {
    arquivo: "eco_vulnerabilidade_mitos.txt",
    gatilhos: [
      "mostrar o que sinto",         // pega “mostrar meus sentimentos…”
      "parece fraqueza sentir",      // pega “sentir demais é fraqueza…”
      "nao posso me abrir",          // acentos removidos no normalizador
      "perigoso se abrir",
      "me proteger emocionalmente",
      "nao quero parecer vulneravel"
    ],
    relacionado: [
      "eco_identificacao_mente.txt",
      "eco_corpo_emocao.txt",
      "eco_heuristica_disponibilidade_emocao_risco.txt"
    ],
    tags: ["vulnerabilidade", "medo", "autoprotecao", "coragem", "inseguranca"],
    intensidadeMinima: 5
  },
  {
    arquivo: "eco_emo_vergonha_combate.txt",
    gatilhos: [
      "sou um fracasso",
      "sou uma decepcao",
      "me sinto indigno",
      "nao sou bom o bastante",
      "ninguem me aceitaria",
      "tenho vergonha",
      "medo de ser julgado",
      "me sinto errado",
      "sou um erro",
      "nao quero que descubram",
      "odeio parecer fraco",
      "escondo meus erros",
      "finjo que nao me importo",
      "me justifico quando erro"
    ],
    relacionado: [
      "eco_identificacao_mente.txt",
      "eco_corpo_emocao.txt"
    ],
    tags: ["vergonha", "vulnerabilidade", "autocritica", "inadequacao", "rejeicao", "autoimagem", "defesa emocional", "culpa"],
    intensidadeMinima: 6
  },
  {
    arquivo: "eco_vulnerabilidade_defesas.txt",
    gatilhos: [
      "nao posso sentir",
      "parecer forte o tempo todo",
      "nao gosto de depender",
      "evito demonstrar",
      "nao quero que saibam",
      "me sinto fraco quando choro",
      "prefiro lidar sozinho",
      "me protejo escondendo",
      "nao posso baixar a guarda",
      "me sinto exposto",
      "fico na defensiva",
      "evito pensar no que machuca",
      "nao quero parecer vulneravel",
      "desconforto com proximidade"
    ],
    relacionado: [
      "eco_identificacao_mente.txt",
      "eco_corpo_emocao.txt",
      "eco_heuristica_disponibilidade_emocao_risco.txt"
    ],
    tags: ["vulnerabilidade", "defesa emocional", "evitacao", "medo de julgamento", "esconder emocoes", "controle", "rigidez", "isolamento", "inseguranca", "perfeccionismo"],
    intensidadeMinima: 5
  }
];
