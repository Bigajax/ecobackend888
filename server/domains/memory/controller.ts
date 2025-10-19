import type { Request, Response } from "express";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { ensureSupabaseConfigured } from "../../lib/supabaseAdmin";
import {
  SupabaseMemoryRepository,
  SupabaseMemoryRepositoryError,
} from "../../adapters/supabaseMemoryRepository";
import { MemoryService, type RegisterMemoryInput } from "./service";
import type { MemoryRepository } from "./repository";

interface ControllerDependencies {
  service?: MemoryService;
  repository?: MemoryRepository;
  supabaseClient?: SupabaseClient;
}

const unauthorizedResponse = { error: "Usuário não autenticado." };

function getBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || typeof auth !== "string") return null;
  const normalized = auth.trim();
  if (!normalized.toLowerCase().startsWith("bearer ")) return null;
  const token = normalized.slice("bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return fallback;
}

const safeLog = (s?: string | null) =>
  process.env.NODE_ENV === "production"
    ? `${(s ?? "").slice(0, 80)}…`
    : s ?? "";

function getUsuarioIdFromQuery(req: Request): string | null {
  const raw =
    (req.query?.usuario_id as string | string[] | undefined) ??
    (req.query?.userId as string | string[] | undefined);

  if (Array.isArray(raw)) {
    const last = raw[raw.length - 1];
    return typeof last === "string" && last.trim() ? last.trim() : null;
  }

  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }

  return null;
}

function getQueryString(value: unknown): string | null {
  if (Array.isArray(value)) {
    const last = value[value.length - 1];
    return typeof last === "string" && last.trim() ? last.trim() : null;
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
}

function respondMissingUserId(res: Response) {
  return res.status(400).json({
    error: {
      code: "MISSING_USER_ID",
      message: "usuario_id é obrigatório",
    },
  });
}

export class MemoryController {
  private readonly service: MemoryService;
  private readonly supabaseClient: SupabaseClient;

  constructor({ repository, service, supabaseClient }: ControllerDependencies = {}) {
    const repo =
      repository ??
      new SupabaseMemoryRepository();

    this.service = service ?? new MemoryService(repo);
    this.supabaseClient = supabaseClient ?? ensureSupabaseConfigured();
  }

  static create(deps?: ControllerDependencies) {
    return new MemoryController(deps);
  }

  private async getAuthenticatedUser(req: Request): Promise<User | null> {
    const token = getBearerToken(req);
    if (!token) return null;

    try {
      const { data, error } = await this.supabaseClient.auth.getUser(token);
      if (error || !data?.user) {
        if (error) {
          console.warn("[Auth] Falha ao obter usuário:", error.message);
        }
        return null;
      }
      return data.user;
    } catch (err) {
      console.error("[Auth] Erro no getUser(jwt):", (err as Error)?.message ?? err);
      return null;
    }
  }

  private async requireAuthenticatedUser(
    req: Request,
    res: Response
  ): Promise<string | null> {
    const user = await this.getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json(unauthorizedResponse);
      return null;
    }
    return user.id;
  }

  registerMemory = async (req: Request, res: Response) => {
    const userId = await this.requireAuthenticatedUser(req, res);
    if (!userId) return;

    const {
      texto,
      intensidade,
      tags,
      mensagem_id,
      emocao_principal,
      contexto,
      dominio_vida,
      padrao_comportamental,
      salvar_memoria = true,
      nivel_abertura,
      analise_resumo,
      categoria = "emocional",
    } = (req.body ?? {}) as RegisterMemoryInput;

    if (!texto || typeof intensidade !== "number") {
      return res.status(400).json({
        error: "Campos obrigatórios ausentes ou inválidos.",
      });
    }

    try {
      const result = await this.service.registerMemory(userId, {
        texto,
        intensidade,
        tags,
        mensagem_id,
        emocao_principal,
        contexto,
        dominio_vida,
        padrao_comportamental,
        salvar_memoria: toBool(salvar_memoria, true),
        nivel_abertura,
        analise_resumo,
        categoria,
      });

      return res
        .status(201)
        .json({ success: true, table: result.table, data: result.data });
    } catch (error) {
      console.error(
        "❌ Erro inesperado ao salvar:",
        (error as Error)?.message || error
      );
      return res.status(500).json({ error: "Erro inesperado no servidor." });
    }
  };

  listMemories = async (req: Request, res: Response) => {
    const userId = getUsuarioIdFromQuery(req);
    if (!userId) {
      return respondMissingUserId(res);
    }

    const limiteParam = (req.query.limite ?? req.query.limit) as
      | string
      | undefined;
    const limit = Math.max(0, Number(limiteParam ?? 0)) || undefined;

    let tags: string[] = [];
    const queryTags = req.query.tags;
    if (Array.isArray(queryTags)) {
      tags = queryTags
        .flatMap((tag) => String(tag).split(","))
        .map((tag) => tag.trim())
        .filter(Boolean);
    } else if (typeof queryTags === "string") {
      tags = queryTags.split(",").map((t) => t.trim()).filter(Boolean);
    }

    try {
      const memories = await this.service.listMemories(userId, { tags, limit });
      console.log(`📥 ${memories.length} memórias retornadas para ${userId}`);

      const toNullableString = (value: unknown): string | null => {
        if (typeof value !== "string") return null;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : null;
      };

      const sanitized = memories.map((memory) => ({
        id: memory.id,
        usuario_id: memory.usuario_id,
        mensagem_id:
          typeof memory.mensagem_id === "string"
            ? memory.mensagem_id.trim() || null
            : memory.mensagem_id ?? null,
        created_at: memory.created_at ?? null,
        emocao_principal: toNullableString(memory.emocao_principal),
        intensidade:
          typeof memory.intensidade === "number"
            ? memory.intensidade
            : null,
        analise_resumo: toNullableString(memory.analise_resumo),
        resumo_eco: toNullableString(memory.resumo_eco),
        tags: Array.isArray(memory.tags)
          ? memory.tags
              .map((tag) => (typeof tag === "string" ? tag.trim() : tag))
              .filter((tag): tag is string => typeof tag === "string" && tag.length > 0)
          : [],
        dominio_vida: toNullableString(memory.dominio_vida),
        padrao_comportamental: toNullableString(memory.padrao_comportamental),
        nivel_abertura:
          typeof memory.nivel_abertura === "number"
            ? memory.nivel_abertura
            : null,
        categoria: toNullableString(memory.categoria),
        contexto: toNullableString(memory.contexto),
      }));

      return res.status(200).json(sanitized);
    } catch (error) {
      if (error instanceof SupabaseMemoryRepositoryError) {
        console.error("❌ Erro Supabase ao buscar memórias:", error.supabase);
        return res.status(502).json({
          error: {
            message: "Não foi possível carregar memórias.",
            code: error.supabase.code ?? "SUPABASE_QUERY_FAILED",
          },
        });
      }

      console.error(
        "❌ Erro inesperado ao buscar memórias:",
        (error as Error)?.message || error
      );
      return res.status(500).json({
        error: {
          message: "Erro inesperado no servidor.",
          code: "UNEXPECTED_ERROR",
        },
      });
    }
  };

  findSimilar = async (req: Request, res: Response) => {
    const userId = await this.requireAuthenticatedUser(req, res);
    if (!userId) return;

    const textoRaw: string = String(req.body?.texto ?? req.body?.query ?? "");
    const texto = textoRaw.trim();
    const limiteRaw = Number(req.body?.limite ?? req.body?.limit ?? 3);
    const limite = Math.max(1, Math.min(5, Number.isNaN(limiteRaw) ? 3 : limiteRaw));

    let threshold: number = Math.max(
      0,
      Math.min(1, Number(req.body?.threshold ?? 0.15))
    );

    if (/lembr|record|memó/i.test(texto)) threshold = Math.min(threshold, 0.12);
    if (texto.length < 20) threshold = Math.min(threshold, 0.1);

    console.log("📩 /similares:", {
      texto: safeLog(texto),
      limite,
      threshold,
    });

    if (!texto) {
      return res
        .status(400)
        .json({ error: "Texto para análise é obrigatório." });
    }

    if (texto.length < 3) {
      return res.status(200).json({ success: true, similares: [] });
    }

    try {
      const similares = await this.service.findSimilarMemories(userId, {
        texto,
        limite,
        threshold,
      });

      console.log(`🔍 ${similares.length} memórias semelhantes normalizadas.`);
      return res.status(200).json({ success: true, similares });
    } catch (error) {
      console.error(
        "❌ Erro em /similares:",
        (error as Error)?.message || error
      );
      return res.status(500).json({ error: "Erro inesperado no servidor." });
    }
  };

  findSimilarV2 = async (req: Request, res: Response) => {
    const usuarioId = getUsuarioIdFromQuery(req);
    const queryText =
      getQueryString(req.query?.q) ||
      getQueryString((req.query as Record<string, unknown>)?.texto) ||
      getQueryString((req.query as Record<string, unknown>)?.query);
    const mensagemId =
      getQueryString(req.query?.mensagem_id) ||
      getQueryString((req.query as Record<string, unknown>)?.mensagemId);

    if (!usuarioId) {
      return res.status(200).json({ success: true, similares: [] });
    }

    if (!queryText && !mensagemId) {
      return res.status(200).json({ success: true, similares: [] });
    }

    let textoBase = queryText ?? "";

    if (!textoBase && mensagemId) {
      try {
        const { data, error } = await this.supabaseClient
          .from("mensagem")
          .select("texto")
          .eq("id", mensagemId)
          .maybeSingle();
        if (error) {
          console.error("❌ Erro ao buscar mensagem para similares_v2:", error.message);
          return res.status(500).json({ error: { code: "UNEXPECTED_ERROR" } });
        }
        const texto = typeof data?.texto === "string" ? data.texto.trim() : "";
        if (!texto) {
          return res.status(200).json({ success: true, similares: [] });
        }
        textoBase = texto;
      } catch (fetchError) {
        console.error(
          "❌ Falha inesperada ao buscar mensagem:",
          (fetchError as Error).message
        );
        return res.status(500).json({ error: { code: "UNEXPECTED_ERROR" } });
      }
    }

    if (!textoBase) {
      return res.status(200).json({ success: true, similares: [] });
    }

    const limiteRaw =
      getQueryString(req.query?.k) ||
      getQueryString(req.query?.limite ?? req.query?.limit) ||
      "3";
    const limiteParsed = Number(limiteRaw);
    const limite = Math.max(1, Math.min(5, Number.isNaN(limiteParsed) ? 3 : limiteParsed));

    const thresholdRaw = getQueryString(req.query?.threshold) ?? "0.15";
    let threshold = Number(thresholdRaw);
    if (!Number.isFinite(threshold)) threshold = 0.15;
    threshold = Math.max(0, Math.min(1, threshold));

    if (/lembr|record|memó/i.test(textoBase)) threshold = Math.min(threshold, 0.12);
    if (textoBase.length < 20) threshold = Math.min(threshold, 0.1);

    try {
      const similares = await this.service.findSimilarMemories(usuarioId, {
        texto: textoBase,
        limite,
        threshold,
      });
      return res.status(200).json({ success: true, similares });
    } catch (error) {
      console.error(
        "❌ Erro inesperado ao buscar memórias (similares_v2):",
        (error as Error)?.message || error
      );
      return res.status(500).json({ error: { code: "UNEXPECTED_ERROR" } });
    }
  };
}

export function createMemoryController(deps?: ControllerDependencies) {
  return MemoryController.create(deps);
}
