import type { Request, Response } from "express";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { MensagemPayload } from "./types";

type SupabaseRequest = Request & { supabase?: SupabaseClient };

const unauthorizedResponse = { error: "Usuário não autenticado." };
const supabaseUnavailableResponse = {
  error: "Cliente Supabase não configurado.",
};

function getBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || typeof auth !== "string") return null;
  const normalized = auth.trim();
  if (!normalized.toLowerCase().startsWith("bearer ")) return null;
  const token = normalized.slice("bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export class MensagemController {
  static create() {
    return new MensagemController();
  }

  private getSupabase(req: Request): SupabaseClient | null {
    const supabase = (req as SupabaseRequest).supabase;
    if (!supabase) {
      console.error(
        "[MensagemController] Supabase client ausente no Request."
      );
      return null;
    }
    return supabase;
  }

  private async getAuthenticatedUser(
    req: Request,
    supabase: SupabaseClient
  ): Promise<User | null> {
    const token = getBearerToken(req);
    if (!token) return null;

    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
        if (error) {
          console.warn("[Auth] Falha ao obter usuário:", error.message);
        }
        return null;
      }
      return data.user;
    } catch (err) {
      console.error(
        "[Auth] Erro no getUser(jwt):",
        (err as Error)?.message ?? err
      );
      return null;
    }
  }

  private async requireAuthenticatedContext(
    req: Request,
    res: Response
  ): Promise<{ userId: string; supabase: SupabaseClient } | null> {
    const supabase = this.getSupabase(req);
    if (!supabase) {
      res.status(500).json(supabaseUnavailableResponse);
      return null;
    }

    const user = await this.getAuthenticatedUser(req, supabase);
    if (!user) {
      res.status(401).json(unauthorizedResponse);
      return null;
    }

    return { userId: user.id, supabase };
  }

  registrar = async (req: Request, res: Response) => {
    const context = await this.requireAuthenticatedContext(req, res);
    if (!context) return;

    const { userId, supabase } = context;
    const body = req.body ?? {};
    const conteudoRaw = body?.conteudo;
    const conteudo =
      typeof conteudoRaw === "string" ? conteudoRaw.trim() : "";

    if (!conteudo) {
      return res.status(400).json({
        error: "conteudo é obrigatório.",
      });
    }

    const payload: MensagemPayload = {
      conteudo,
      usuario_id: userId,
    };

    if (typeof body.salvar_memoria === "boolean") {
      payload.salvar_memoria = body.salvar_memoria;
    }

    if (typeof body.mensagem_id === "string") {
      const mensagemId = body.mensagem_id.trim();
      if (mensagemId) {
        payload.mensagem_id = mensagemId;
      }
    }

    try {
      const { data, error } = await supabase
        .from("mensagem")
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error(
          "[MensagemController] Erro Supabase ao registrar mensagem:",
          error.message
        );
        return res.status(500).json({
          error: "Erro ao registrar mensagem.",
        });
      }

      return res.status(201).json(data);
    } catch (err) {
      console.error(
        "[MensagemController] Erro inesperado ao registrar mensagem:",
        (err as Error)?.message ?? err
      );
      return res.status(500).json({
        error: "Erro ao registrar mensagem.",
      });
    }
  };

  listar = async (req: Request, res: Response) => {
    const context = await this.requireAuthenticatedContext(req, res);
    if (!context) return;

    const { userId, supabase } = context;

    try {
      const { data, error } = await supabase
        .from("mensagem")
        .select("*")
        .eq("usuario_id", userId);

      if (error) {
        console.error(
          "[MensagemController] Erro Supabase ao listar mensagens:",
          error.message
        );
        return res.status(500).json({
          error: "Erro ao carregar mensagens.",
        });
      }

      return res.status(200).json(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(
        "[MensagemController] Erro inesperado ao listar mensagens:",
        (err as Error)?.message ?? err
      );
      return res.status(500).json({
        error: "Erro ao carregar mensagens.",
      });
    }
  };
}

export const createMensagemController = () => MensagemController.create();
