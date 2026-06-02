import type { EvalCase } from "./types";

/**
 * Conjunto representativo de casos. Expansível — comece pequeno e cresça com casos reais
 * (anonimizados). Cada caso fixa o cenário e (opcionalmente) força nível/intensidade.
 */
export const EVAL_CASES: EvalCase[] = [
  {
    id: "carreira_atraso",
    cenario: "Carreira/dinheiro com sensação de atraso (conflito identitário)",
    texto:
      "tenho dinheiro entrando mas continuo preocupado, sinto que estou atrasado e todo mundo já conseguiu menos eu",
    nivel: 3,
    intensidade: 8,
    vuln: true,
  },
  {
    id: "vergonha_autoimagem",
    cenario: "Vergonha / identidade negativa",
    texto: "sinto muita vergonha, sinto que sou um fracasso e que vão descobrir que eu não sou bom o bastante",
    nivel: 3,
    intensidade: 8,
    vuln: true,
  },
  {
    id: "luto",
    cenario: "Luto / perda recente",
    texto: "minha mãe faleceu mês passado e eu não consigo lidar com essa saudade, parece que não vai passar",
    nivel: 3,
    intensidade: 9,
    vuln: true,
  },
  {
    id: "decisao",
    cenario: "Impasse / decisão",
    texto: "não sei se devo pedir demissão pra empreender ou continuar no emprego seguro, fico na dúvida entre os dois",
    nivel: 2,
    intensidade: 5,
  },
  {
    id: "ruminacao",
    cenario: "Pensamento em loop",
    texto: "não paro de pensar numa conversa que tive ontem, fico remoendo e não saio disso",
    nivel: 2,
    intensidade: 6,
  },
  {
    id: "saudacao",
    cenario: "Saudação simples (baixa abertura)",
    texto: "oi, tudo bem?",
    nivel: 1,
  },
  {
    id: "pedido_pratico",
    cenario: "Pedido prático (não forçar reflexão)",
    texto: "me dá um passo a passo pra organizar minhas tarefas da semana",
    nivel: 1,
  },
  {
    id: "continuidade_memoria",
    cenario: "Continuidade com memória pertinente",
    texto: "voltei a pensar naquilo do trabalho que te contei",
    nivel: 2,
    intensidade: 5,
    criteria: [
      "conflito_sob_o_fato",
      "sem_cliche",
      "profundidade_calibrada",
      "no_maximo_uma_pergunta",
      "uso_memoria",
    ],
    memoriasSemelhantes: [
      {
        resumo_eco: "Perdi meu emprego e me senti perdido sobre o que fazer.",
        similarity: 0.86,
        tags: ["trabalho", "perda"],
        created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
        dominio_vida: "trabalho",
      },
    ],
  },
];
