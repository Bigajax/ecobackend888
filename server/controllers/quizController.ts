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
    const { answers, utm, quiz_source } = req.body ?? {};

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({
        error: "INVALID_PAYLOAD",
        message: "answers deve ser um array não-vazio",
      });
    }

    const supabase = ensureSupabaseConfigured();

    const { data, error } = await supabase
      .from("quiz_responses")
      .insert({
        answers,
        utm_data: utm ?? null,
        quiz_source: quiz_source ?? "quiz_sono",
      })
      .select("id")
      .single();

    if (error) {
      logger.error("quiz_response_insert_error", { error: error.message });
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erro ao salvar respostas" });
    }

    logger.info("quiz_response_saved", { id: data.id, quiz_source: quiz_source ?? "quiz_sono" });

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
