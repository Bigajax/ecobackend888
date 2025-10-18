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
    const userId = await this.requireAuthenticatedUser(req, res);
    if (!userId) return;

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
      if (memories.length === 0) {
        return res.status(204).send();
      }

      const { embedding, embedding_emocional, ...rest } = memories[0];
      console.log("[MemoryController] Campos da primeira memória:", {
        keys: Object.keys(memories[0]),
        sample: rest,
        embeddingPresent: Array.isArray(embedding),
        embeddingEmocionalPresent: Array.isArray(embedding_emocional),
      });

      return res.status(200).json({ success: true, memories });
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
}

export function createMemoryController(deps?: ControllerDependencies) {
  return MemoryController.create(deps);
}
