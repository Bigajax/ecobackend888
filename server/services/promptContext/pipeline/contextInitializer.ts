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

  // Memórias recuperadas (busca semântica + fallbacks de referências/recentes).
  // O antigo caminho `recall` nunca era preenchido em produção e foi removido.
  const mems: SimilarMemory[] =
    ((Array.isArray(memsSemelhantes) && memsSemelhantes.length
      ? memsSemelhantes
      : memoriasSemelhantes) as SimilarMemory[] | undefined) ?? [];
  const hasMemories: boolean = mems.length > 0;
  const memsSemelhantesNorm = mems;

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
