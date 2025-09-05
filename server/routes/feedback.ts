import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabaseAdmin"; // confirme o path

const router = Router();

const FeedbackSchema = z.object({
  sessaoId: z.string().min(6),
  usuarioId: z.string().uuid().optional(),
  mensagemId: z.string().uuid().optional(), // envie só se for ID real do BANCO
  rating: z.union([z.literal(1), z.literal(-1)]),
  reason: z.string().trim().max(2000).optional(),
  source: z.string().default("thumb_prompt"),
  meta: z.record(z.unknown()).optional(), // <- sem 'any'
});

// POST /api/feedback
// eslint-disable-next-line @typescript-eslint/no-misused-promises
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const parse = FeedbackSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({
      error: "Payload inválido",
      details: parse.error.flatten(),
    });
    return;
  }

  const payload = parse.data;

  const insertBody: Record<string, unknown> = {
    sessao_id: payload.sessaoId,
    usuario_id: payload.usuarioId ?? null,
    rating: payload.rating,
    reason: payload.reason ?? null,
    source: payload.source,
    meta: payload.meta ?? {},
  };

  // só define FK se vier (evita erro de chave estrangeira)
  if (payload.mensagemId) {
    (insertBody as any).mensagem_id = payload.mensagemId;
  }

  const { error } = await supabaseAdmin
    .from("feedback_interacoes")
    .insert(insertBody);

  if (error) {
    console.error("[feedback] insert error:", error);
    res.status(500).json({
      error: "Falha ao salvar feedback",
      details: error.message,
    });
    return;
  }

  res.json({ ok: true });
});

export default router;
