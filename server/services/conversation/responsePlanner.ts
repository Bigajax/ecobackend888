import type { ResponsePlan } from "../../utils/types";
import {
  ensureTrailingQuestion,
  extractKeywords,
  formatKeywordList,
  lowerFirst,
  normalizeForMatch,
} from "./textUtils";

interface DomainPlan {
  id: string;
  regex: RegExp;
  foco: string;
  passos: string[];
  perguntaFinal: string;
}

const DOMAIN_PLANS: DomainPlan[] = [
  {
    id: "ansiedade",
    regex: /ansios|agitado|preocupad|tens[ao]|inquiet|nervos|apreensiv|acelerad|angust/,
    foco: "Cuidar da ansiedade e mapear o que ativa essa tensão.",
    passos: [
      "Acolher a sensação sem tentar resolver rápido.",
      "Refletir onde ela sente a ansiedade no corpo ou nos pensamentos.",
      "Oferecer escolha entre regular o corpo ou explorar a causa.",
    ],
    perguntaFinal: "O que deixaria essa ansiedade 5% mais suportável agora?",
  },
  {
    id: "cansaco",
    regex: /cansad|exaust|esgotad|sem\s+energia|desgastad|fatigad|sobrecarg|sobrecarreg/,
    foco: "Cuidar da exaustão e mapear necessidades de descanso.",
    passos: [
      "Reconhecer que o corpo está no limite.",
      "Refletir qual parte pede pausa ou suporte.",
      "Convidar a separar o que é urgente do que pode esperar.",
    ],
    perguntaFinal: "Qual o primeiro sinal de que seu corpo pede pausa neste momento?",
  },
  {
    id: "tristeza",
    regex: /trist|chorar|chatead|desanim|pra\s+baixo|melancol|desesperanç/,
    foco: "Abrir espaço para a tristeza e entender o que ela revela.",
    passos: [
      "Acolher o peso com calma.",
      "Refletir a dor ou perda que aparece no relato.",
      "Convidar a nomear o que mais precisa de cuidado.",
    ],
    perguntaFinal: "O que nessa tristeza pede ser reconhecido primeiro?",
  },
  {
    id: "raiva",
    regex: /raiva|irritad|furios|brav[oa]|ódio|injustiç|injustica|indign/,
    foco: "Dar contorno para a raiva e entender o que ela protege.",
    passos: [
      "Validar a energia da raiva.",
      "Refletir o gatilho principal.",
      "Explorar o que ela gostaria de proteger ou mudar.",
    ],
    perguntaFinal: "O que você sente que essa raiva está tentando proteger?",
  },
  {
    id: "medo",
    regex: /medo|receio|insegur|apavor|assustad|temer|pavor|temor/,
    foco: "Mapear o medo e diferenciar ameaça real de antecipação.",
    passos: [
      "Acolher a sensação de medo sem minimizar.",
      "Refletir onde esse medo aparece (corpo, pensamentos, cenário).",
      "Convidar a identificar um passo pequeno de segurança.",
    ],
    perguntaFinal: "O que traria 1% de segurança para você agora?",
  },
  {
    id: "solidao",
    regex: /solidao|sozinh|isolad|desconect|abandona/,
    foco: "Oferecer companhia e mapear onde falta conexão.",
    passos: [
      "Reconhecer a sensação de estar só.",
      "Refletir se a falta é externa ou interna.",
      "Convidar a identificar qual ponte faria diferença.",
    ],
    perguntaFinal: "Que tipo de presença faria diferença para você hoje?",
  },
  {
    id: "confusao",
    regex: /confus|perdid|indecis|bagunç|bagunc|sem\s+rumo|n[aã]o\s+sei/,
    foco: "Trazer clareza e organizar o que está embaralhado.",
    passos: [
      "Acolher a sensação de estar perdido.",
      "Refletir o dilema ou decisão central.",
      "Convidar a escolher um ponto pequeno para começar.",
    ],
    perguntaFinal: "Qual pergunta interna merece atenção primeiro?",
  },
  {
    id: "desmotivacao",
    regex: /desmotiv|sem\s+vontade|sem\s+força|desist|tanto\s+faz|pra\s+que/,
    foco: "Reconectar com sentido e pequenos impulsos de ação.",
    passos: [
      "Validar o baixo ânimo sem cobrança.",
      "Refletir o que drenou a motivação.",
      "Convidar a escolher um passo minúsculo que faça sentido.",
    ],
    perguntaFinal: "O que mereceria receber 10% da sua energia hoje?",
  },
  {
    id: "gratidao",
    regex: /gratid|grato|grata|feliz|aliviad|leve|celebr/,
    foco: "Ampliar a sensação boa e registrá-la de forma consciente.",
    passos: [
      "Celebrar junto de forma genuína.",
      "Refletir o que gerou essa sensação.",
      "Convidar a guardar ou expandir esse estado.",
    ],
    perguntaFinal: "Como você gostaria de guardar essa sensação com carinho?",
  },
];

const DEFAULT_PLAN: ResponsePlan = {
  foco: "Criar um espaço seguro para você se ouvir com clareza.",
  passos: [
    "Acolher o que a pessoa trouxe, sem pressa.",
    "Refletir a parte mais viva do relato.",
    "Convidar para aprofundar onde sentir necessidade.",
  ],
  perguntaFinal: "Onde faz sentido começarmos juntos agora?",
  temas: [],
};

export function sugerirPlanoResposta(ultimaMsg: string): ResponsePlan {
  const normalized = normalizeForMatch(ultimaMsg || "");
  const temas = extractKeywords(ultimaMsg || "", 3);
  const matched = DOMAIN_PLANS.find((plan) => plan.regex.test(normalized));

  if (!matched) {
    return { ...DEFAULT_PLAN, temas };
  }

  return {
    foco: matched.foco,
    passos: [...matched.passos],
    perguntaFinal: matched.perguntaFinal,
    temas,
  };
}

export function construirRespostaPersonalizada(
  ultimaMsg: string,
  plan: ResponsePlan
): string {
  const temas = plan.temas && plan.temas.length ? plan.temas : extractKeywords(ultimaMsg || "", 2);
  const temaTexto = temas.length ? `Quando você fala sobre ${formatKeywordList(temas)},` : "Pelo que você trouxe,";
  const foco = plan.foco.replace(/\.$/, "");
  const focoSegment = foco ? ` queria primeiro ${lowerFirst(foco)}.` : "";
  const primeiroPasso = plan.passos?.[0] ? ` Podemos começar ${lowerFirst(plan.passos[0].replace(/\.$/, ""))}.` : "";
  const pergunta = ensureTrailingQuestion(plan.perguntaFinal || DEFAULT_PLAN.perguntaFinal);

  return (
    `Quero te acompanhar de verdade, sem respostas prontas. ${temaTexto}${focoSegment}` +
    `${primeiroPasso} ${pergunta}`
  ).trim();
}
