import { REFLEXO_PATTERNS, type ReflexaoPlanner } from "./reflexoPatterns";

export type ResponsePlan = {
  theme?: string;
  priority: number;
  acknowledgement: string;
  exploration: string;
  invitation: string;
};

const DEFAULT_PLANNER: ReflexaoPlanner = {
  acknowledgement:
    "Tô aqui com você, presente e sem pressa.",
  exploration:
    "Vamos notar, com calma, o que este momento acende em pensamentos, corpo ou emoções.",
  invitation:
    "O que pede um pouco mais de atenção agora pra gente ganhar clareza, sem se cobrar?",
};

function normalize(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")                 // remove acentos pra casar melhor com os padrões
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// pega um recorte curto e seguro da mensagem pra eco refletir sem ficar repetitiva
function shortReflect(input: string, max = 90): string | null {
  const t = (input || "").trim();
  if (!t) return null;
  // tira quebras e espaços múltiplos
  const oneLine = t.replace(/\s+/g, " ");
  // se já for curto, usa; senão, corta com “…” no fim
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max).replace(/[.,;:\-–—\s]+$/, "") + "…";
}

export function planCuriousFallback(message: string): { text: string; plan: ResponsePlan } {
  const normalized = normalize(message);
  const hits: {
    key: string;
    priority: number;
    planner: ReflexaoPlanner;
  }[] = [];

  for (const [key, entry] of Object.entries(REFLEXO_PATTERNS)) {
    // patterns já foram pensados em pt-BR; com normalize acima, casam melhor
    if (entry.patterns.some((rx) => rx.test(normalized))) {
      hits.push({ key, priority: entry.priority, planner: entry.planner });
    }
  }

  // menor prioridade = mais urgente (1 > 2 > 3)
  hits.sort((a, b) => a.priority - b.priority);
  const selected = hits[0];

  const basePlanner = selected?.planner ?? DEFAULT_PLANNER;

  const plan: ResponsePlan = {
    theme: selected?.key ?? "neutro",
    priority: selected?.priority ?? 4,
    acknowledgement: basePlanner.acknowledgement,
    exploration: basePlanner.exploration,
    invitation: basePlanner.invitation,
  };

  // adiciona um reflexo curto do que a pessoa trouxe pra não soar “frase pronta”
  const reflect = shortReflect(message);
  // formata o texto final mantendo tom da ECO: direto, gentil, sem múltiplas perguntas
  // estrutura: [ack] [reflexo opcional] [exploration] [invitation]
  const parts: string[] = [];
  if (plan.acknowledgement) parts.push(plan.acknowledgement);

  if (reflect) {
    // usa um conector leve e respeitoso, sem repetir demais
    parts.push(`Do que você trouxe: “${reflect}”.`);
  }

  if (plan.exploration) parts.push(plan.exploration);
  if (plan.invitation) parts.push(plan.invitation);

  const text = parts.join(" ");

  return { text, plan };
}
