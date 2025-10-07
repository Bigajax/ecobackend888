import { REFLEXO_PATTERNS, type ReflexaoPlanner } from "./reflexoPatterns";

export type ResponsePlan = {
  theme?: string;
  priority: number;
  acknowledgement: string;
  exploration: string;
  invitation: string;
};

const DEFAULT_PLANNER: ReflexaoPlanner = {
  acknowledgement: "Estou aqui, presente com você.",
  exploration: "Vamos respirar um instante e notar o que este momento desperta em pensamentos, corpo ou emoções.",
  invitation: "Qual parte disso pede mais atenção agora para ganharmos clareza?",
};

function normalize(text: string): string {
  return (text || "").trim().toLowerCase();
}

export function planCuriousFallback(message: string): { text: string; plan: ResponsePlan } {
  const normalized = normalize(message);
  const hits: {
    key: string;
    priority: number;
    planner: ReflexaoPlanner;
  }[] = [];

  for (const [key, entry] of Object.entries(REFLEXO_PATTERNS)) {
    if (entry.patterns.some((rx) => rx.test(normalized))) {
      hits.push({ key, priority: entry.priority, planner: entry.planner });
    }
  }

  hits.sort((a, b) => a.priority - b.priority);
  const selected = hits[0];

  const basePlanner = selected?.planner ?? DEFAULT_PLANNER;
  const plan: ResponsePlan = {
    theme: selected?.key,
    priority: selected?.priority ?? 4,
    acknowledgement: basePlanner.acknowledgement,
    exploration: basePlanner.exploration,
    invitation: basePlanner.invitation,
  };

  const text = [plan.acknowledgement, plan.exploration, plan.invitation]
    .filter(Boolean)
    .join(" ");

  return { text, plan };
}
