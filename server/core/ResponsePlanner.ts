import { REFLEXO_PATTERNS, type ReflexaoPlanner } from "./reflexoPatterns";

export type ResponsePlan = {
  theme?: string;
  priority: number;
  acknowledgement: string;
  exploration: string;
  invitation: string;
};

export type PlanOptions = {
  tone?: "warm" | "neutral";     // tom de voz
  maxQuestionMarks?: number;     // limite de interrogações
  variations?: number;           // quantas variações textuais sugerir
};

const DEFAULT_PLANNER: ReflexaoPlanner = {
  acknowledgement: "Tô aqui com você, presente e sem pressa.",
  exploration: "Vamos notar com calma o que este momento acende em pensamentos, corpo ou emoções.",
  invitation: "O que pede um pouco mais de atenção agora pra gente ganhar clareza, sem se cobrar?",
};

function normalize(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shortReflect(input: string, max = 90): string | null {
  const t = (input || "").trim().replace(/\s+/g, " ");
  if (!t) return null;
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/[.,;:\-–—\s]+$/, "") + "…";
}

// hash simples pra variação estável por mensagem (evita soar randômico demais)
function strHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// garante no máximo N interrogações (evita “interrogatório”)
function ensureMaxQuestions(text: string, max = 1): string {
  if (max <= 0) return text.replace(/\?/g, ".");
  let count = 0;
  return text.replace(/\?/g, () => (++count <= max ? "?" : "."));
}

// aplica micro-ajustes de linguagem por tom
function toneAdjust(text: string, tone: "warm" | "neutral"): string {
  if (tone === "warm") {
    // leve calor; 1 emoji no máximo para manter sobriedade
    let out = text;
    // adiciona um ✨ discreto após o convite, se couber
    out = out.replace(/(\s*)([^.!?]*\?)?$/, (m) =>
      m.includes("✨") ? m : m.trimEnd() + " ✨"
    );
    return out;
  }
  return text;
}

export function planCurious(
  message: string,
  opts: PlanOptions = {}
): { texts: string[]; plan: ResponsePlan } {
  const { tone = "neutral", maxQuestionMarks = 1, variations = 2 } = opts;

  const normalized = normalize(message);
  const hits: { key: string; priority: number; planner: ReflexaoPlanner }[] = [];

  for (const [key, entry] of Object.entries(REFLEXO_PATTERNS)) {
    if (entry.patterns.some((rx) => rx.test(normalized))) {
      hits.push({ key, priority: entry.priority, planner: entry.planner });
    }
  }

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

  const reflect = shortReflect(message);

  // blocos com pequenas variações (ack/explore/invite)
  const ackVariants = [
    plan.acknowledgement,
    "Tô com você aqui, sem pressa e sem julgamento.",
  ].filter(Boolean);

  const exploreVariants = [
    plan.exploration,
    "Se a gente observar um instante, o que aparece no corpo, nos pensamentos ou nas emoções?",
  ].filter(Boolean);

  const inviteVariants = [
    plan.invitation,
    "Qual parte disso pede um pouco mais de espaço agora pra gente ver melhor?",
  ].filter(Boolean);

  const baseSeed = strHash(message);
  const pick = <T,>(arr: T[], seedShift: number) => arr[(baseSeed + seedShift) % arr.length];

  // gera até N variações com ordem e conectores levemente diferentes
  const connectors = [
    (r?: string) => (r ? `Do que você trouxe: “${r}”.` : ""),
    (r?: string) => (r ? `Pegando um fio do que você disse — “${r}”.` : ""),
    (r?: string) => (r ? `Recebo isso: “${r}”.` : ""),
  ];

  const texts: string[] = [];
  const count = Math.max(1, Math.min(variations, 3));

  for (let i = 0; i < count; i++) {
    const ack = pick(ackVariants, i);
    const conn = pick(connectors, i)(reflect || undefined);
    const exp = pick(exploreVariants, i + 7);
    const inv = pick(inviteVariants, i + 13);

    // monta sem excesso de perguntas
    let text = [ack, conn, exp, inv].filter(Boolean).join(" ");
    text = ensureMaxQuestions(text, maxQuestionMarks);
    text = toneAdjust(text, tone);

    // limpeza de duplas pontuações
    text = text.replace(/\s{2,}/g, " ").replace(/\.\./g, ".");
    texts.push(text);
  }

  return { texts, plan };
}

// wrapper de compatibilidade: retorna somente uma string (primeira variação)
export function planCuriousFallback(message: string): { text: string; plan: ResponsePlan } {
  const { texts, plan } = planCurious(message, { tone: "neutral", maxQuestionMarks: 1, variations: 1 });
  return { text: texts[0], plan };
}
