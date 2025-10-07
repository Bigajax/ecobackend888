import type { GetEcoResult } from "../../utils";

import type { EcoStreamMetaPayload } from "./types";

export function buildFinalizedStreamText(result: GetEcoResult): string {
  const intensidade = typeof result.intensidade === "number" ? result.intensidade : null;
  const resumo = typeof result.resumo === "string" ? result.resumo : null;
  const emocao = typeof result.emocao === "string" ? result.emocao : null;
  const tags = Array.isArray(result.tags) ? result.tags : [];
  const categoria = typeof result.categoria === "string" ? result.categoria : null;
  const proactive = result.proactive ?? null;
  const plan = result.plan ?? null;
  const planContext = result.planContext ?? null;

  const payload: Record<string, unknown> = {};

  if (intensidade !== null) payload.intensidade = intensidade;
  if (typeof resumo === "string" && resumo.trim() !== "") payload.resumo = resumo;
  if (typeof emocao === "string" && emocao.trim() !== "") payload.emocao = emocao;
  payload.tags = tags;
  payload.categoria = categoria;
  if (proactive !== null) payload.proactive = proactive;
  if (plan !== null) payload.plan = plan;
  if (planContext !== null) payload.planContext = planContext;

  const hasMeta =
    intensidade !== null ||
    (typeof resumo === "string" && resumo.trim() !== "") ||
    (typeof emocao === "string" && emocao.trim() !== "") ||
    (Array.isArray(tags) && tags.length > 0) ||
    (typeof categoria === "string" && categoria.trim() !== "") ||
    proactive !== null ||
    plan !== null ||
    planContext !== null;

  if (!hasMeta) {
    return result.message ?? "";
  }

  return `${result.message ?? ""}` +
    `\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
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
