// routes/feedbackRoutes.ts
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";

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
  const parsed = FeedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Payload inválido",
      details: parsed.error.flatten(),
    });
    return;
  }

  const payload = parsed.data;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn(
      `[feedbackRoute][limited-mode][env=${process.env.NODE_ENV ?? "development"}] Supabase admin misconfigured`
    );
    res.status(200).json({
      ok: false,
      mode: "limited",
      error: "Supabase admin misconfigured",
    });
    return;
  }

  const insertBody: Record<string, unknown> = {
    sessao_id: payload.sessaoId,
    usuario_id: payload.usuarioId ?? null,
    rating: payload.rating,
    reason: payload.reason ?? null,
    source: payload.source,
    meta: payload.meta ?? {},
    created_at: new Date().toISOString(), // (opcional) útil se a tabela não tiver default
  };

  // só define FK se vier (evita erro de chave estrangeira)
  if (payload.mensagemId) {
    (insertBody as any).mensagem_id = payload.mensagemId;
  }

  try {
    const { error } = await supabase
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

    res.status(201).json({ ok: true });
  } catch (e: any) {
    // erro de configuração (ex.: envs do Supabase ausentes)
    console.error("[feedback] supabase error:", e);
    res.status(500).json({
      error: "Falha ao inicializar serviço de dados",
      details: e?.message ?? String(e),
    });
  }
});

export default router;
