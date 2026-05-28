import type { Request, Response } from "express";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { log } from "../services/promptContext/logger";

const logger = log.withContext("quiz-controller");

/**
 * POST /api/quiz/response
 *
 * Salva as respostas do quiz de sono.
 * Rota PÚBLICA — sem autenticação.
 *
 * Body: { answers: [{ question, answer }], utm?, quiz_source? }
 * Returns: { id }
 */
export async function saveQuizResponse(req: Request, res: Response) {
  try {
    const { answers, utm, quiz_source, skipped } = req.body ?? {};
    const skippedFlag = skipped === true;

    if (!Array.isArray(answers)) {
      return res.status(400).json({
        error: "INVALID_PAYLOAD",
        message: "answers deve ser um array",
      });
    }
    if (answers.length === 0 && !skippedFlag) {
      return res.status(400).json({
        error: "INVALID_PAYLOAD",
        message: "answers deve ser não-vazio (ou skipped: true)",
      });
    }

    const guestHeader = req.headers["x-eco-guest-id"];
    const guestId = typeof guestHeader === "string" && guestHeader.length > 0 ? guestHeader : null;

    const supabase = ensureSupabaseConfigured();

    const { data, error } = await supabase
      .from("quiz_responses")
      .insert({
        answers,
        utm_data: utm ?? null,
        quiz_source: quiz_source ?? "quiz_sono",
        skipped: skippedFlag,
        guest_id: guestId,
      })
      .select("id")
      .single();

    if (error) {
      logger.error("quiz_response_insert_error", { error: error.message });
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erro ao salvar respostas" });
    }

    logger.info("quiz_response_saved", {
      id: data.id,
      quiz_source: quiz_source ?? "quiz_sono",
      skipped: skippedFlag,
      hasGuestId: Boolean(guestId),
    });

    return res.status(201).json({ id: data.id });
  } catch (error) {
    logger.error("save_quiz_response_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erro ao salvar respostas" });
  }
}

/**
 * PATCH /api/quiz/response/:id/convert
 *
 * Marca uma resposta de quiz como convertida (clique no CTA de compra).
 * Rota PÚBLICA — sem autenticação.
 * Idempotente: não falha se já estava convertido.
 *
 * Returns: { success: true }
 */
export async function markQuizConverted(req: Request, res: Response) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "MISSING_ID", message: "ID obrigatório" });
    }

    const supabase = ensureSupabaseConfigured();

    const { error } = await supabase
      .from("quiz_responses")
      .update({ converted: true, converted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("converted", false);

    if (error) {
      logger.error("quiz_convert_update_error", { id, error: error.message });
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erro ao registrar conversão" });
    }

    logger.info("quiz_response_converted", { id });

    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error("mark_quiz_converted_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erro ao registrar conversão" });
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/quiz/response/:id/link-user
 *
 * Vincula uma resposta de quiz ao usuário autenticado (após signup/login).
 * Idempotente: 200 com alreadyLinked=true se já estava vinculado.
 */
export async function linkUserToQuizResponse(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Autenticação obrigatória" });
    }

    const { id } = req.params;
    if (!id || !UUID_RE.test(id)) {
      return res.status(400).json({ error: "INVALID_ID", message: "ID inválido" });
    }

    const supabase = ensureSupabaseConfigured();

    const { data: existing, error: selectErr } = await supabase
      .from("quiz_responses")
      .select("id, user_id")
      .eq("id", id)
      .maybeSingle();

    if (selectErr) {
      logger.error("quiz_link_select_error", { id, error: selectErr.message });
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erro ao buscar resposta" });
    }
    if (!existing) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Resposta não encontrada" });
    }
    if (existing.user_id) {
      logger.info("quiz_link_noop_already_linked", { id });
      return res.status(200).json({ success: true, alreadyLinked: true });
    }

    const { error: updateErr } = await supabase
      .from("quiz_responses")
      .update({ user_id: userId })
      .eq("id", id)
      .is("user_id", null)
      .select("id");

    if (updateErr) {
      logger.error("quiz_link_update_error", { id, error: updateErr.message });
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erro ao vincular usuário" });
    }

    logger.info("quiz_link_success", { id, userId });
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error("link_user_to_quiz_response_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erro inesperado" });
  }
}
