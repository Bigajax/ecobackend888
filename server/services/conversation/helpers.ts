export function firstName(name?: string): string {
  return (name || "").trim().split(/\s+/)[0] || "";
}

export function stripIdentityCorrection(text: string, nome?: string): string {
  if (!nome) return text;
  const escapedNome = nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const needsWordBoundary = /[A-Za-z0-9_]$/.test(nome);
  const suffix = needsWordBoundary ? "\\b" : "(?!\\w)";
  const re = new RegExp(
    String.raw`(?:^|\n).*?(?:eu\s*)?sou\s*a?\s*eco[^.\n]*não\s+o?a?\s*${escapedNome}${suffix}.*`,
    "i"
  );
  return text.replace(re, "").trim();
}

export function stripRedundantGreeting(
  text: string,
  hasAssistantBefore: boolean
): string {
  if (!hasAssistantBefore) return text;
  let out = text.replace(
    /^\s*(?:oi|olá|ola|bom dia|boa tarde|boa noite)[,!\.\-\–—\s]+/i,
    ""
  );
  out = out.trim();
  return out.length ? out : text;
}

export function isLowComplexity(texto: string): boolean {
  const t = (texto || "").trim();
  if (t.length <= 140) return true;
  const words = t.split(/\s+/).length;
  if (words <= 22) return true;
  return !/crise|p[aâ]nico|desesper|vontade de sumir|explod|insuport|plano detalhado|passo a passo/i.test(
    t
  );
}

export function heuristicaPreViva(texto: string): boolean {
  const lower = (texto || "").toLowerCase();
  const len = lower.length;
  const gatilhos = [
    /ang[uú]st/i,
    /p[aâ]nico/i,
    /desesper/i,
    /crise/i,
    /sofr/i,
    /n[aã]o aguento/i,
    /vontade de sumir/i,
    /explod/i,
    /impulsiv/i,
    /medo/i,
    /ansiedad/i,
    /culpa/i,
    /triste/i,
  ];
  return gatilhos.some((regex) => regex.test(lower)) || len >= 180;
}
