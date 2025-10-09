import { Router, type Request, type Response } from "express";

import {
  resetGuestInteraction,
  blockGuestId,
} from "../core/http/middlewares/guestSession";
import { trackGuestClaimed } from "../analytics/events/mixpanelEvents";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const router = Router();

const getHeaderString = (value: string | string[] | undefined): string | undefined => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
};

const sanitizeGuestId = (input: unknown): string | null => {
  if (!input) return null;
  const text = String(input).trim();
  return UUID_V4_REGEX.test(text) ? text : null;
};

router.post("/claim", async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    });
  }
  const authHeader = getHeaderString(req.headers.authorization);
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token de acesso ausente." });
  }
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Token inválido ou usuário não encontrado." });
    }

    const guestId =
      sanitizeGuestId(req.body?.guestId) ||
      sanitizeGuestId(req.body?.guest_id) ||
      sanitizeGuestId(req.body?.id);

    if (!guestId) {
      return res.status(400).json({ error: "Guest ID inválido." });
    }

    const userId = data.user.id;
    if (!userId) {
      return res.status(400).json({ error: "Usuário inválido." });
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from("referencias_temporarias")
      .update({ usuario_id: userId })
      .eq("usuario_id", guestId)
      .select("id");

    if (updateError) {
      return res.status(500).json({
        error: "Erro ao migrar referências do convidado.",
        details: updateError.message,
      });
    }

    resetGuestInteraction(guestId);
    blockGuestId(guestId);
    trackGuestClaimed({ guestId, userId });

    return res.status(200).json({ migrated: Array.isArray(updatedRows) ? updatedRows.length : 0 });
  } catch (error: any) {
    return res.status(500).json({ error: "Erro interno.", details: error?.message });
  }
});

export default router;
