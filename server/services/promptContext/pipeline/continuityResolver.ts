import { detectarContinuidade } from "../continuityDetector";
import { buscarMemoriasSemelhantesV2 } from "../../buscarMemorias";
import { log } from "../logger";
import type { ContextMeta } from "../../../utils/types";
import type { SimilarMemory } from "../contextTypes";
import {
  continuityDias,
  continuityEmotion,
  continuitySimilarity,
  continuityTags,
} from "../helpers/continuityHelpers";

export interface ContinuityResolverParams {
  contextFlagsBase: Record<string, unknown>;
  contextMetaBase: ContextMeta;
  normalizedUserId: string;
  normalizedTexto: string;
  memsSemelhantesNorm: SimilarMemory[];
  hasMemories: boolean;
  effectiveUserInsertId: string;
}

export interface ContinuityResolution {
  contextFlags: Record<string, unknown>;
  contextMeta: ContextMeta;
  continuityRef: any;
  hasContinuity: boolean;
}

export async function resolveContinuity({
  contextFlagsBase,
  contextMetaBase,
  normalizedUserId,
  normalizedTexto,
  memsSemelhantesNorm,
  hasMemories,
  effectiveUserInsertId,
}: ContinuityResolverParams): Promise<ContinuityResolution> {
  let continuityRefCandidate = contextMetaBase?.continuityRef ?? null;
  let hasContinuityCandidate = Boolean(
    (contextFlagsBase as any)?.HAS_CONTINUITY && continuityRefCandidate
  );

  if (!hasContinuityCandidate && continuityRefCandidate) {
    hasContinuityCandidate = true;
  }

  if (!hasContinuityCandidate && normalizedUserId && normalizedTexto.trim().length) {
    try {
      const detection = await detectarContinuidade(normalizedUserId, normalizedTexto, {
        buscarMemoriasSemelhantesV2: async (userId: string, q: string) => {
          if (
            userId === normalizedUserId &&
            Array.isArray(memsSemelhantesNorm) &&
            memsSemelhantesNorm.length > 0
          ) {
            return memsSemelhantesNorm as any[];
          }
          try {
            return await buscarMemoriasSemelhantesV2(userId, q);
          } catch (error) {
            log.warn("[ContextBuilder] buscar_memorias_v2_failed", {
              message: error instanceof Error ? error.message : String(error),
            });
            return [];
          }
        },
      });
      if (detection.hasContinuity && detection.memoryRef) {
        hasContinuityCandidate = true;
        continuityRefCandidate = detection.memoryRef;
      }
    } catch (error) {
      log.warn("[ContextBuilder] continuity_detector_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!hasContinuityCandidate) {
    continuityRefCandidate = null;
  }

  const contextFlags: Record<string, unknown> = {
    ...contextFlagsBase,
    HAS_CONTINUITY: Boolean(hasContinuityCandidate),
  };

  const contextMeta: ContextMeta = {
    ...contextMetaBase,
    continuityRef: hasContinuityCandidate ? continuityRefCandidate ?? null : null,
    userIdUsedForInsert: effectiveUserInsertId || null,
    hasMemories,
  };

  const continuityRef = contextMeta?.continuityRef;
  const hasContinuity = Boolean((contextFlags as any)?.HAS_CONTINUITY && continuityRef);

  return {
    contextFlags,
    contextMeta,
    continuityRef,
    hasContinuity,
  };
}

export function buildContinuityModuleText(ref: any): string {
  if (!ref) return "";

  const emotion = continuityEmotion(ref);
  const diasValue = continuityDias(ref);
  const diasLabel = diasValue != null ? `${diasValue} dia${diasValue === 1 ? "" : "s"}` : "? dias";
  const similarity = continuitySimilarity(ref);
  const similarityLabel = similarity != null ? similarity.toFixed(2) : "?";
  const tags = continuityTags(ref);

  const lines = [
    `Referência-base: emoção ${emotion}, há ${diasLabel}, similaridade ${similarityLabel}.`,
  ];

  if (tags.length) {
    lines.push(`Tags recentes: ${tags.join(", ")}.`);
  }

  return lines.join("\n");
}

export function buildContinuityPromptLine(ref: any): string {
  const emotion = continuityEmotion(ref);
  const diasValue = continuityDias(ref);
  const similarity = continuitySimilarity(ref);
  const parts = ["[CONTINUIDADE DETECTADA]"];
  if (emotion && emotion !== "?") {
    parts.push(`emoção: ${emotion}`);
  }
  if (diasValue != null) {
    parts.push(`dias_desde: ${diasValue}`);
  }
  if (similarity != null) {
    parts.push(`similarity: ${similarity.toFixed(2)}`);
  }
  return parts.join(" | ");
}

export const isUseMemoriasModule = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .includes("usomemor");

export function applyContinuityTextToModule<T extends { name: string; text: string }>(
  module: T,
  hasContinuity: boolean,
  continuityRef: unknown
): T {
  if (!isUseMemoriasModule(module.name)) {
    return module;
  }

  if (!hasContinuity) {
    return module;
  }

  const baseText = typeof module.text === "string" ? module.text.trim() : "";
  const continuityText = buildContinuityModuleText(continuityRef).trim();
  const combined = [baseText, continuityText].filter((part) => part.length > 0).join("\n\n");

  return {
    ...module,
    text: combined,
  };
}
