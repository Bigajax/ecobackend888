import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import type {
  MemoryInsertPayload,
  MemoryRepository,
  MemoryRow,
} from "../domains/memory/repository";

type MemoriesTableRow = {
  id: string;
  usuario_id: string;
  mensagem_id: string | null;
  resumo_eco: string | null;
  tags: string[] | string | null;
  intensidade: number | string | null;
  emocao_principal: string | null;
  contexto: string | null;
  dominio_vida: string | null;
  padrao_comportamental: string | null;
  nivel_abertura: number | null;
  analise_resumo: string | null;
  categoria: string | null;
  created_at: string;
};

export interface SupabaseMemoryRepositoryErrorDetails {
  code?: string;
  hint?: string;
  details?: string;
  status?: string | number;
}

export class SupabaseMemoryRepositoryError extends Error {
  constructor(
    message: string,
    readonly supabase: SupabaseMemoryRepositoryErrorDetails = {}
  ) {
    super(message);
    this.name = "SupabaseMemoryRepositoryError";
  }
}

export interface ListMemoriesOptions {
  tags?: string[];
  limit?: number;
}

export async function insertMemory(
  table: string,
  payload: MemoryInsertPayload
): Promise<MemoryRow> {
  const admin = ensureSupabaseConfigured();
  const { data, error } = await admin
    .from(table)
    .insert([payload])
    .select()
    .single();

  if (error) {
    throw new Error(error.message || "Erro ao salvar no Supabase.");
  }

  if (!data) {
    throw new Error("Erro ao salvar no Supabase: resposta vazia.");
  }

  return data;
}

export async function listMemories(
  usuarioId: string,
  options: ListMemoriesOptions = {}
): Promise<MemoryRow[]> {
  const admin = ensureSupabaseConfigured();
  const { tags = [], limit } = options;

  const columns: (keyof MemoriesTableRow)[] = [
    "id",
    "usuario_id",
    "mensagem_id",
    "resumo_eco",
    "tags",
    "intensidade",
    "emocao_principal",
    "contexto",
    "dominio_vida",
    "padrao_comportamental",
    "nivel_abertura",
    "analise_resumo",
    "categoria",
    "created_at",
  ];

  let query = admin
    .from("memories")
    .select(columns.join(","))
    .eq("usuario_id", usuarioId)
    .eq("salvar_memoria", true)
    .order("created_at", { ascending: false });

  if (tags.length) {
    query = query.overlaps("tags", tags);
  }

  if (limit && limit > 0) {
    query = query.range(0, limit - 1);
  }

  const { data, error, status } = await query.returns<MemoriesTableRow[]>();

  console.log("[SupabaseMemoryRepository] listMemories raw response", {
    usuarioId,
    error: error?.message ?? null,
    data,
  });

  if (error) {
    console.error("[SupabaseMemoryRepository] Supabase error", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      status,
    });

    throw new SupabaseMemoryRepositoryError(
      "Falha ao consultar memórias no Supabase.",
      {
        code: error.code,
        details: error.details,
        hint: error.hint,
        status,
      }
    );
  }

  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }

  const normalizeTags = (rawTags: MemoriesTableRow["tags"]): string[] => {
    if (Array.isArray(rawTags)) {
      return rawTags.filter((tag): tag is string => typeof tag === "string");
    }

    if (typeof rawTags === "string") {
      return rawTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
    }

    return [];
  };

  const normalizeIntensity = (
    value: MemoriesTableRow["intensidade"]
  ): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.min(10, value));
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.min(10, parsed));
      }
    }

    return null;
  };

  return data.map<MemoryRow>((row) => ({
    id: row.id,
    usuario_id: row.usuario_id,
    mensagem_id: row.mensagem_id,
    resumo_eco: row.resumo_eco,
    tags: normalizeTags(row.tags),
    intensidade: normalizeIntensity(row.intensidade),
    emocao_principal: row.emocao_principal,
    contexto: row.contexto,
    dominio_vida: row.dominio_vida,
    padrao_comportamental: row.padrao_comportamental,
    nivel_abertura: row.nivel_abertura,
    analise_resumo: row.analise_resumo,
    categoria: row.categoria,
    created_at: row.created_at,
  }));
}

export class SupabaseMemoryRepository implements MemoryRepository {
  async save(table: string, payload: MemoryInsertPayload): Promise<MemoryRow> {
    return insertMemory(table, payload);
  }

  async list(params: {
    usuario_id: string;
    tags?: string[];
    limit?: number;
  }): Promise<MemoryRow[]> {
    return listMemories(params.usuario_id, {
      tags: params.tags,
      limit: params.limit,
    });
  }
}

export default SupabaseMemoryRepository;
