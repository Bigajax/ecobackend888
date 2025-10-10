import { Router, type Request, type Response } from "express";

import {
  resetGuestInteraction,
  blockGuestId,
} from "../core/http/middlewares/guestSession";
import { trackGuestClaimed } from "../analytics/events/mixpanelEvents";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const router = Router();

/* ----------------------------- helpers ----------------------------- */

const getHeaderString = (value: string | string[] | undefined): string | undefined => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
};

/**
 * Normaliza qualquer entrada para um guestId CANÔNICO "guest_<uuid>".
 * Aceita formatos:
 *   - "<uuid>"
 *   - "guest_<uuid>"
 *   - "guest:<uuid>"
 *   - "guest-<uuid>"
 *
 * Retorna também todos os ALIASES possíveis para atualizar registros que
 * possam ter sido salvos com outros formatos.
 */
function normalizeGuestId(
  input: unknown
): { uuid: string; canonical: string; aliases: string[] } | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  const prefixes = ["guest_", "guest:", "guest-"];

  let uuid: string | null = null;

  if (UUID_V4_REGEX.test(lower)) {
    uuid = lower;
  } else {
    for (const p of prefixes) {
      if (lower.startsWith(p)) {
        const candidate = lower.slice(p.length);
        if (UUID_V4_REGEX.test(candidate)) {
          uuid = candidate;
          break;
        }
      }
    }
  }

  if (!uuid) return null;

  const canonical = `guest_${uuid}`;
  const aliases = [uuid, `guest_${uuid}`, `guest:${uuid}`, `guest-${uuid}`];

  return { uuid, canonical, aliases };
}

/* ----------------------------- route ----------------------------- */

router.post("/claim", async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(500).json({
      error: "Serviço de dados indisponível.",
      details: "Supabase admin não configurado.",
    });
  }

  // Requer login (Bearer do usuário autenticado)
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

    // Aceita body: { guestId | guest_id | id } em qualquer dos formatos suportados
    const norm =
      normalizeGuestId(req.body?.guestId) ||
      normalizeGuestId(req.body?.guest_id) ||
      normalizeGuestId(req.body?.id);

    if (!norm) {
      return res.status(400).json({ error: "Guest ID inválido." });
    }

    const userId = data.user.id;
    if (!userId) {
      return res.status(400).json({ error: "Usuário inválido." });
    }

    // Migra referências gravadas com QUALQUER variação do guestId
    const { data: updatedRows, error: updateError } = await supabase
      .from("referencias_temporarias")
      .update({ usuario_id: userId })
      .in("usuario_id", norm.aliases) // cobre uuid puro e as três variantes com 'guest'
      .select("id");

    if (updateError) {
      return res.status(500).json({
        error: "Erro ao migrar referências do convidado.",
        details: updateError.message,
      });
    }

    // Limpa contadores e bloqueia o guestId canônico para evitar reuso
    resetGuestInteraction(norm.canonical);
    blockGuestId(norm.canonical);

    trackGuestClaimed({ guestId: norm.canonical, userId });

    return res
      .status(200)
      .json({ migrated: Array.isArray(updatedRows) ? updatedRows.length : 0 });
  } catch (error: any) {
    return res.status(500).json({ error: "Erro interno.", details: error?.message });
  }
});

export default router;
