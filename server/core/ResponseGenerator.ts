import type { EcoHintFlag, EcoHints } from "../utils/types";

const OPENING_BY_FLAG: Record<EcoHintFlag, string> = {
  needs_grounding: "Comece aterrando e desacelerando.",
  slow_breath: "Convide a respirar mais lento antes de explorar.",
  needs_validation: "Valide a experiência de forma direta e gentil.",
  tender_voice: "Use tom macio e cuidadoso.",
  ack_intensity: "Reconheça a intensidade sem consertar de imediato.",
  highlight_connection: "Reforce disponibilidade e companhia.",
  celebrate: "Valorize a conquista com sobriedade.",
  body_scan: "Convide a notar o corpo antes de seguir.",
  needs_reassurance: "Diga que pode ir devagar; você está junto.",
  gentle_energy: "Traga calor leve, sem entusiasmo forçado.",
};

const FALLBACK_OPENING =
  "Traga presença gentil e valide a experiência antes de perguntar.";

function sanitizeSnippet(text: string): string | null {
  if (!text) return null;
  const cleaned = text
    .replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDD00-\uDFFF])/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  const first = cleaned.split(/(?<=[.!?…])\s+/)[0] ?? cleaned;
  const snippet = first.slice(0, 110).trim();
  return snippet.length < 8 ? null : snippet.replace(/["“”'`]+/g, "");
}

function pickOpening(flags: EcoHintFlag[]): string {
  for (const f of flags) if (OPENING_BY_FLAG[f]) return OPENING_BY_FLAG[f]!;
  return FALLBACK_OPENING;
}

export function materializeHints(hints: EcoHints | null, userText: string): EcoHints | null {
  if (!hints) return null;
  const flags = Array.from(new Set(hints.flags ?? []));
  const snip = sanitizeSnippet(userText);
  const mirror = snip
    ? `Espelhe em 1 linha o trecho “${snip}” e só então convide com leveza.`
    : "Espelhe em 1 linha a sensação central e convide com leveza.";
  return {
    ...hints,
    flags,
    soft_opening: pickOpening(flags),
    mirror_suggestion: mirror,
  };
}
