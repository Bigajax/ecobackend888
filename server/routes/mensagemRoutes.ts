import express, { type Request, type Response } from "express";

import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import {
  registrarMensagem,
  type MensagemInsertPayload,
} from "../services/mensagemService";

const router = express.Router();

router.post("/", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Partial<MensagemInsertPayload>;

  const usuarioId = typeof body.usuario_id === "string" ? body.usuario_id.trim() : "";
  const conteudo =
    typeof body.conteudo === "string" ? body.conteudo.trim() : "";

  if (!usuarioId) {
    return res.status(400).json({
      ok: false,
      error: { message: "usuario_id é obrigatório" },
    });
  }

  if (!conteudo) {
    return res.status(400).json({
      ok: false,
      error: { message: "conteudo é obrigatório" },
    });
  }

  try {
    const supabase = ensureSupabaseConfigured();
    const payload: MensagemInsertPayload = {
      usuario_id: usuarioId,
      conteudo,
    };

    if (typeof body.data_hora === "string" && body.data_hora.trim()) {
      payload.data_hora = body.data_hora;
    }

    if (body.sentimento === null || typeof body.sentimento === "string") {
      payload.sentimento = body.sentimento;
    }

    if (typeof body.salvar_memoria === "boolean") {
      payload.salvar_memoria = body.salvar_memoria;
    }

    const registro = await registrarMensagem(supabase, payload);

    return res.status(200).json({ ok: true, data: registro });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao registrar mensagem.";
    return res.status(500).json({ ok: false, error: { message } });
  }
});

export default router;
