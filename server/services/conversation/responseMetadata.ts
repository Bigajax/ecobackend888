import type { GetEcoResult } from "../../utils";
import { extractJson } from "../../utils/text";

import type { EcoStreamMetaPayload } from "./types";

const STREAM_META_KEYS: Array<keyof EcoStreamMetaPayload> = [
  "intensidade",
  "resumo",
  "emocao",
  "categoria",
  "tags",
];

function hasStreamingMeta(json: Record<string, any> | null): boolean {
  if (!json) return false;
  for (const key of STREAM_META_KEYS) {
    if (key === "tags") {
      if (!Array.isArray(json[key]) || json[key].length === 0) {
        return false;
      }
      continue;
    }

    if (typeof json[key] === "string") {
      if (!json[key].trim()) {
        return false;
      }
      continue;
    }

    if (typeof json[key] === "number") {
      if (!Number.isFinite(json[key])) {
        return false;
      }
      continue;
    }

    return false;
  }
  return true;
}

function buildMetaFromResult(result: GetEcoResult) {
  return buildStreamingMetaPayload(
    {
      intensidade: result.intensidade,
      analise_resumo: result.resumo,
      emocao_principal: result.emocao,
      categoria: result.categoria,
      tags: result.tags,
    },
    typeof result.message === "string" ? result.message : ""
  );
}

export function buildFinalizedStreamText(result: GetEcoResult): string {
  const base = typeof result.message === "string" ? result.message : "";
  const trimmedBase = base.trimEnd();
  const metaPayload = buildMetaFromResult(result);

  if (!metaPayload) {
    return trimmedBase;
  }

  const existingJson = extractJson<Record<string, any>>(trimmedBase);
  if (hasStreamingMeta(existingJson)) {
    return trimmedBase;
  }

  const separator = trimmedBase.length > 0 ? "\n\n" : "";
  const jsonBlock = JSON.stringify(metaPayload, null, 2);
  const wrapped = "```json\n" + jsonBlock + "\n```";
  return trimmedBase.length > 0 ? `${trimmedBase}${separator}${wrapped}` : wrapped;
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
