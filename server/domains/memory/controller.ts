import type { Request, Response } from "express";

import {
  SupabaseMemoryRepository,
  SupabaseMemoryRepositoryError,
} from "../../adapters/supabaseMemoryRepository";
import type { MemoryRepository } from "./repository";

interface ControllerDependencies {
  repository?: MemoryRepository;
}

const toNullableString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

function parseTags(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  return list
    .flatMap((tag) => String(tag).split(","))
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function createMemoryController({ repository }: ControllerDependencies = {}) {
  const repo = repository ?? new SupabaseMemoryRepository();

  /** GET /api/memorias: memórias do usuário do token (requireAuth antes). */
  const listMemories = async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Usuário não autenticado." } });
    }

    const limitParsed = Number(req.query.limite ?? req.query.limit ?? 0);
    const limit = Number.isFinite(limitParsed) && limitParsed > 0 ? Math.min(limitParsed, 500) : undefined;

    try {
      const rows = await repo.list({ usuario_id: userId, tags: parseTags(req.query.tags), limit });

      const memories = rows
        .filter((m) => typeof m.resumo_eco === "string" && m.resumo_eco.trim())
        .map((m) => ({
          id: m.id,
          usuario_id: m.usuario_id,
          mensagem_id: toNullableString(m.mensagem_id),
          created_at: m.created_at ?? null,
          emocao_principal: toNullableString(m.emocao_principal),
          intensidade: typeof m.intensidade === "number" ? m.intensidade : null,
          analise_resumo: toNullableString(m.analise_resumo),
          resumo_eco: toNullableString(m.resumo_eco),
          tags: Array.isArray(m.tags)
            ? m.tags.map((t) => (typeof t === "string" ? t.trim() : "")).filter(Boolean)
            : [],
          dominio_vida: toNullableString(m.dominio_vida),
          padrao_comportamental: toNullableString(m.padrao_comportamental),
          nivel_abertura: typeof m.nivel_abertura === "number" ? m.nivel_abertura : null,
          categoria: toNullableString(m.categoria),
          contexto: toNullableString(m.contexto),
        }));

      return res.status(200).json(memories);
    } catch (error) {
      if (error instanceof SupabaseMemoryRepositoryError) {
        console.error("[memorias] erro Supabase:", error.supabase);
        return res.status(502).json({
          error: { message: "Não foi possível carregar memórias.", code: error.supabase.code ?? "SUPABASE_QUERY_FAILED" },
        });
      }
      console.error("[memorias] erro inesperado:", (error as Error)?.message || error);
      return res.status(500).json({ error: { message: "Erro inesperado no servidor.", code: "UNEXPECTED_ERROR" } });
    }
  };

  return { listMemories };
}
