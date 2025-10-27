import type { ContextMeta } from "../../../utils/types";
import type { BuildParams, SimilarMemory } from "../contextTypes";

export interface ContextInitialization {
  contextFlagsBase: Record<string, unknown>;
  contextMetaBase: ContextMeta;
  mems: SimilarMemory[];
  hasMemories: boolean;
  memsSemelhantesNorm: SimilarMemory[];
  normalizedUserId: string;
  normalizedGuestId: string;
  normalizedTexto: string;
  effectiveUserInsertId: string;
  memCount: number;
}

export function initializeContext(params: BuildParams): ContextInitialization {
  const {
    mems: memsCompact = [],
    memsSemelhantes,
    memoriasSemelhantes,
    contextFlags: contextFlagsParam = {},
    contextMeta: contextMetaParam = {},
    recall: recallParam = null,
    userId: _userId,
    guestId: _guestId = null,
    texto,
  } = params;

  const contextFlagsBase =
    contextFlagsParam && typeof contextFlagsParam === "object"
      ? { ...(contextFlagsParam as Record<string, unknown>) }
      : {};
  const contextMetaBase: ContextMeta =
    contextMetaParam && typeof contextMetaParam === "object"
      ? { ...(contextMetaParam as ContextMeta) }
      : {};

  const recallFromParams =
    recallParam && typeof recallParam === "object" && recallParam !== null
      ? recallParam
      : null;
  const recallMetaCandidate = (contextMetaBase as any)?.recall;
  const recallFromMeta =
    recallMetaCandidate && typeof recallMetaCandidate === "object"
      ? (recallMetaCandidate as unknown)
      : null;
  const recall = (recallFromParams ?? recallFromMeta ?? null) as
    | { items?: SimilarMemory[] | null; memories?: SimilarMemory[] | null }
    | null;

  const recallItemsCandidate = (recall?.items ?? recall?.memories) as unknown;
  const mems = Array.isArray(recallItemsCandidate)
    ? (recallItemsCandidate as SimilarMemory[])
    : [];
  const hasMemories: boolean = mems.length > 0;

  const memsFallback =
    (memsSemelhantes && Array.isArray(memsSemelhantes) && memsSemelhantes.length
      ? memsSemelhantes
      : memoriasSemelhantes) || [];
  const memsSemelhantesNorm = hasMemories ? mems : (memsFallback as SimilarMemory[]);

  const normalizedUserId =
    typeof _userId === "string" && _userId.trim().length ? _userId.trim() : "";
  const normalizedGuestId =
    typeof _guestId === "string" && _guestId.trim().length ? _guestId.trim() : "";
  const normalizedTexto = typeof texto === "string" ? texto : "";
  const metaUserInsertRaw =
    typeof (contextMetaBase as any)?.userIdUsedForInsert === "string" &&
    (contextMetaBase as any).userIdUsedForInsert.trim().length
      ? ((contextMetaBase as any).userIdUsedForInsert as string).trim()
      : "";
  const effectiveUserInsertId = metaUserInsertRaw || normalizedUserId;

  return {
    contextFlagsBase,
    contextMetaBase,
    mems,
    hasMemories,
    memsSemelhantesNorm,
    normalizedUserId,
    normalizedGuestId,
    normalizedTexto,
    effectiveUserInsertId,
    memCount: memsCompact.length,
  };
}
