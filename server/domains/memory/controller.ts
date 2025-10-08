import type { Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MemoryRepository } from "./repository";
import { MemoryService } from "./service";

interface ControllerDependencies {
  repository?: MemoryRepository;
  service?: MemoryService;
  supabaseClient?: SupabaseClient;
}

function toBool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return fallback;
}

const safeLog = (s: string) =>
  process.env.NODE_ENV === "production" ? (s || "").slice(0, 80) + "…" : s || "";

export class MemoryController {
  private readonly service: MemoryService;
  private supabaseClient: SupabaseClient | null;

  constructor({ repository, service, supabaseClient }: ControllerDependencies = {}) {
    const repo = repository ?? new MemoryRepository();
    this.service = service ?? new MemoryService(repo);
    this.supabaseClient = supabaseClient ?? null;
  }

  private ensureSupabase(req: Request, res: Response): SupabaseClient | null {
    if (req.supabaseAdmin) {
      this.supabaseClient = req.supabaseAdmin;
      return req.supabaseAdmin;
    }
    if (this.supabaseClient) {
      return this.supabaseClient;
    }
    res.status(500).json({
      type: "about:blank",
      title: "Admin configuration missing",
      detail: "SUPABASE_URL ou SERVICE_ROLE ausentes no servidor.",
      status: 500,
    });
    return null;
  }

  private async getAuthenticatedUser(req: Request, client: SupabaseClient) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice("Bearer ".length).trim();

    try {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data?.user) {
        console.warn("[Auth] Falha ao obter usuário:", error?.message);
        return null;
      }
      return data.user;
    } catch (err: any) {
      console.error("[Auth] Erro no getUser(jwt):", err?.message ?? err);
      return null;
    }
  }

  registerMemory = async (req: Request, res: Response) => {
    const client = this.ensureSupabase(req, res);
    if (!client) return;

    const user = await this.getAuthenticatedUser(req, client);
    if (!user) return res.status(401).json({ error: "Usuário não autenticado." });

    const {
      texto,
      tags,
      intensidade,
      mensagem_id,
      emocao_principal,
      contexto,
      dominio_vida,
      padrao_comportamental,
      salvar_memoria = true,
      nivel_abertura,
      analise_resumo,
      categoria = "emocional",
    } = req.body ?? {};

    if (!texto || typeof intensidade !== "number") {
      return res.status(400).json({ error: "Campos obrigatórios ausentes ou inválidos." });
    }

    try {
      const result = await this.service.registerMemory(user.id, {
        texto,
        tags,
        intensidade,
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

      return res.status(201).json({ success: true, table: result.table, data: result.data });
    } catch (error: any) {
      console.error("❌ Erro inesperado ao salvar:", error?.message || error);
      return res.status(500).json({ error: "Erro inesperado no servidor." });
    }
  };

  listMemories = async (req: Request, res: Response) => {
    const client = this.ensureSupabase(req, res);
    if (!client) return;

    const user = await this.getAuthenticatedUser(req, client);
    if (!user) return res.status(401).json({ error: "Usuário não autenticado." });

    const limiteParam = (req.query.limite ?? req.query.limit) as string | undefined;
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
      const memories = await this.service.listMemories(user.id, { tags, limit });
      console.log(`📥 ${memories.length} memórias retornadas para ${user.id}`);
      return res.status(200).json({ success: true, memories });
    } catch (error: any) {
      console.error("❌ Erro inesperado ao buscar memórias:", error?.message || error);
      return res.status(500).json({ error: "Erro inesperado no servidor." });
    }
  };

  findSimilar = async (req: Request, res: Response) => {
    const client = this.ensureSupabase(req, res);
    if (!client) return;

    const user = await this.getAuthenticatedUser(req, client);
    if (!user) return res.status(401).json({ error: "Usuário não autenticado." });

    const textoRaw: string = String(req.body?.texto ?? req.body?.query ?? "");
    const texto = textoRaw.trim();
    const limiteRaw = Number(req.body?.limite ?? req.body?.limit ?? 3);
    const limite = Math.max(1, Math.min(5, Number.isNaN(limiteRaw) ? 3 : limiteRaw));
    let threshold: number = Math.max(0, Math.min(1, Number(req.body?.threshold ?? 0.15)));

    if (/lembr|record|memó/i.test(texto)) threshold = Math.min(threshold, 0.12);
    if (texto.length < 20) threshold = Math.min(threshold, 0.1);

    console.log("📩 /similares:", { texto: safeLog(texto), limite, threshold });

    if (!texto) {
      return res.status(400).json({ error: "Texto para análise é obrigatório." });
    }
    if (texto.length < 3) {
      return res.status(200).json({ success: true, similares: [] });
    }

    try {
      const similares = await this.service.findSimilarMemories(user.id, {
        texto,
        limite,
        threshold,
      });
      console.log(`🔍 ${similares.length} memórias semelhantes normalizadas.`);
      return res.status(200).json({ success: true, similares });
    } catch (error: any) {
      console.error("❌ Erro em /similares:", error?.message || error);
      return res.status(500).json({ error: "Erro inesperado no servidor." });
    }
  };
}

export function createMemoryController(deps?: ControllerDependencies) {
  return new MemoryController(deps);
}
