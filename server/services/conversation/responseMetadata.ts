import type { GetEcoResult } from "../../utils";

import type { EcoStreamMetaPayload } from "./types";

export function buildFinalizedStreamText(result: GetEcoResult): string {
  return typeof result.message === "string" ? result.message : "";
}

export function buildStreamingMetaPayload(
  bloco: any,
  cleanedFallback: string
): EcoStreamMetaPayload | null {
  if (!bloco || typeof bloco !== "object") {
    return null;
  }

  const intensidade =
    typeof bloco.intensidade === "number" && Number.isFinite(bloco.intensidade)
      ? bloco.intensidade
      : null;
  const resumo = typeof bloco.analise_resumo === "string" ? bloco.analise_resumo.trim() : "";
  const emocao = typeof bloco.emocao_principal === "string" ? bloco.emocao_principal.trim() : "";
  const categoria = typeof bloco.categoria === "string" ? bloco.categoria.trim() : "";
  const tags = Array.isArray(bloco.tags)
    ? bloco.tags
        .map((tag: any) => (typeof tag === "string" ? tag.trim() : ""))
        .filter((tag: string) => tag.length > 0)
    : [];

  if (
    intensidade === null ||
    resumo.length === 0 ||
    emocao.length === 0 ||
    categoria.length === 0 ||
    tags.length === 0
  ) {
    return null;
  }

  return {
    intensidade,
    resumo: resumo || cleanedFallback,
    emocao,
    categoria,
    tags,
  };
}
