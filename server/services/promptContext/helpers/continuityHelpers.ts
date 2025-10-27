import { extractNumber } from "./validationHelpers";

export function continuitySimilarity(ref: any): number | null {
  return extractNumber(ref?.similarity ?? ref?.similaridade ?? null);
}

export function continuityDias(ref: any): number | null {
  const dias = extractNumber(ref?.dias_desde ?? ref?.diasDesde ?? ref?.dias ?? null);
  if (dias == null) return null;
  return dias < 0 ? 0 : Math.floor(dias);
}

export function continuityEmotion(ref: any): string {
  const raw = typeof ref?.emocao_principal === "string" ? ref.emocao_principal.trim() : "";
  return raw.length ? raw : "?";
}

export function continuityTags(ref: any): string[] {
  if (!Array.isArray(ref?.tags)) return [];
  return (ref.tags as unknown[])
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag) => tag.length > 0)
    .slice(0, 3);
}
