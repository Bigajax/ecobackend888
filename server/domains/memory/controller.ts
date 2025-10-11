import type { Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";

import { MemoryService, type RegisterMemoryInput } from "./service";
import type { MemoryRepository } from "./repository";
import { SupabaseMemoryRepository } from "../../adapters/supabaseMemoryRepository";

interface ControllerDependencies {
  service?: MemoryService;
  repository?: MemoryRepository;
}

const unauthorizedResponse = {
  code: "UNAUTHORIZED",
  message: "Missing or invalid token",
} as const;

function getBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || typeof auth !== "string") return null;
  const normalized = auth.trim();
  if (!normalized.toLowerCase().startsWith("bearer ")) return null;
  const token = normalized.slice("bearer ".length).trim();
  return token.length > 0 ? token : null;
}

async function resolveUserId(admin: SupabaseClient, token: string): Promise<string | null> {
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.id) {
    return null;
  }
  return data.user.id;
}

export class MemoryController {
  constructor(private readonly service: MemoryService) {}

  static create(deps: ControllerDependencies = {}): MemoryController {
    if (deps.service) {
      return new MemoryController(deps.service);
    }
    const repository = deps.repository ?? new SupabaseMemoryRepository();
    const service = new MemoryService(repository);
    return new MemoryController(service);
  }

  private getAdmin(req: Request): SupabaseClient | null {
    return req.admin ?? null;
  }

  private async requireAuthenticatedUser(req: Request, res: Response): Promise<string | null> {
    const admin = this.getAdmin(req);
    if (!admin) {
      res.status(500).json({ code: "SUPABASE_ADMIN_NOT_CONFIGURED" });
      return null;
    }

    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json(unauthorizedResponse);
      return null;
    }

    try {
      const userId = await resolveUserId(admin, token);
      if (!userId) {
        res.status(401).json(unauthorizedResponse);
        return null;
      }
      return userId;
    } catch (err) {
      console.error("[MemoryController] Failed to validate JWT", err);
      res.status(500).json({ code: "INTERNAL_ERROR" });
      return null;
    }
  }

  registerMemory = async (req: Request, res: Response) => {
    try {
      const userId = await this.requireAuthenticatedUser(req, res);
      if (!userId) return;

      const {
        texto,
        intensidade,
        tags = [],
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
          code: "BAD_REQUEST",
          message: "texto e intensidade são obrigatórios",
        });
      }

      try {
        const result = await this.service.registerMemory(userId, {
          texto,
          tags,
          intensidade,
          mensagem_id,
          emocao_principal,
          contexto,
          dominio_vida,
          padrao_comportamental,
          salvar_memoria,
          nivel_abertura,
          analise_resumo,
          categoria,
        });

        return res.status(201).json(result);
      } catch (serviceErr) {
        console.error("[MemoryController] service error", serviceErr);
        return res.status(500).json({ code: "INTERNAL_ERROR" });
      }
    } catch (error) {
      console.error("[MemoryController.registerMemory] error", error);
      return res.status(500).json({ code: "INTERNAL_ERROR" });
    }
  };

  listMemories = async (req: Request, res: Response) => {
    try {
      const userId = await this.requireAuthenticatedUser(req, res);
      if (!userId) return;

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

      const memories = await this.service.listMemories(userId, { tags, limit });
      return res.status(200).json({ success: true, memories });
    } catch (error) {
      console.error("[MemoryController.listMemories] error", error);
      return res.status(500).json({ code: "INTERNAL_ERROR" });
    }
  };

  findSimilar = async (req: Request, res: Response) => {
    try {
      const userId = await this.requireAuthenticatedUser(req, res);
      if (!userId) return;

      const textoRaw: string = String(req.body?.texto ?? req.body?.query ?? "");
      const texto = textoRaw.trim();
      const limiteRaw = Number(req.body?.limite ?? req.body?.limit ?? 3);
      const limite = Math.max(1, Math.min(5, Number.isNaN(limiteRaw) ? 3 : limiteRaw));
      let threshold: number = Math.max(0, Math.min(1, Number(req.body?.threshold ?? 0.15)));

      if (/lembr|record|memó/i.test(texto)) threshold = Math.min(threshold, 0.12);
      if (texto.length < 20) threshold = Math.min(threshold, 0.1);

      if (!texto) {
        return res
          .status(400)
          .json({ code: "BAD_REQUEST", message: "texto is required" });
      }
      if (texto.length < 3) {
        return res.status(200).json({ success: true, similares: [] });
      }

      const similares = await this.service.findSimilarMemories(userId, {
        texto,
        limite,
        threshold,
      });
      return res.status(200).json({ success: true, similares });
    } catch (error) {
      console.error("[MemoryController.findSimilar] error", error);
      return res.status(500).json({ code: "INTERNAL_ERROR" });
    }
  };
}

export function createMemoryController(deps?: ControllerDependencies) {
  return MemoryController.create(deps);
}
