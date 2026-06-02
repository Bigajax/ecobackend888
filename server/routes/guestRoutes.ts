import { Router, type Request, type Response } from "express";
import { Resend } from "resend";

import {
  resetGuestInteraction,
  blockGuestId,
} from "../core/http/middlewares/guestSession";
import { trackGuestClaimed } from "../analytics/events/mixpanelEvents";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";

/*
 * Supabase migration — execute no SQL Editor do projeto antes de usar este endpoint:
 *
 * CREATE TABLE IF NOT EXISTS guest_leads (
 *   id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
 *   contact       text        NOT NULL,
 *   type          text        NOT NULL CHECK (type IN ('whatsapp', 'email')),
 *   preferred_time text,
 *   source        text        NOT NULL DEFAULT 'noite1_post_meditation',
 *   guest_id      text,
 *   created_at    timestamptz NOT NULL DEFAULT now()
 * );
 * CREATE INDEX IF NOT EXISTS idx_guest_leads_contact ON guest_leads (contact);
 */

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

    const incomingGuestId = req.get("X-Eco-Guest-Id");
    const incomingSessionId = req.get("X-Eco-Session-Id");

    if (incomingGuestId) {
      res.setHeader("X-Eco-Guest-Id", incomingGuestId);
    }
    if (incomingSessionId) {
      res.setHeader("X-Eco-Session-Id", incomingSessionId);
    }

    return res.status(204).end();
  } catch (error: any) {
    return res.status(500).json({ error: "Erro interno.", details: error?.message });
  }
});

/* ----------------------------- POST /api/guest/lead ----------------------------- */

router.post("/lead", async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(500).json({ error: "Serviço de dados indisponível." });
  }

  const { contact, type, preferredTime, source } = req.body ?? {};

  // Validação básica
  if (!contact || typeof contact !== "string" || contact.trim().length === 0) {
    return res.status(400).json({ error: "Campo 'contact' obrigatório." });
  }
  if (type !== "whatsapp" && type !== "email") {
    return res.status(400).json({ error: "Campo 'type' deve ser 'whatsapp' ou 'email'." });
  }

  const guestId = getHeaderString(req.headers["x-eco-guest-id"]) ?? null;

  try {
    // Insere na tabela guest_leads (ignora duplicatas do mesmo contato no mesmo dia)
    const { error: insertError } = await supabase
      .from("guest_leads")
      .insert({
        contact: contact.trim(),
        type,
        preferred_time: preferredTime ?? null,
        source: source ?? "noite1_post_meditation",
        guest_id: guestId,
      });

    if (insertError) {
      // Código 23505 = unique constraint violation — lead já existe, não é erro crítico
      if (insertError.code !== "23505") {
        console.error("[guest/lead] insert error:", insertError.message);
        return res.status(500).json({ error: "Erro ao salvar lead." });
      }
    }

    // Disparo de email de confirmação (só se Resend estiver configurado e contato for email)
    if (type === "email" && process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "ECO <noreply@ecotopia.app>",
          to: contact.trim(),
          subject: "Sua Noite 2 está guardada 🌙",
          html: `
            <p>Olá!</p>
            <p>Você concluiu a <strong>Noite 1</strong> do Protocolo Sono Profundo.</p>
            <p>A Noite 2 — <em>Respiração que Induz o Sono</em> — está esperando por você.</p>
            <p>
              <a href="https://ecofrontend888.vercel.app/sono/noite-1" style="color:#7C6EF6">
                Continuar o protocolo →
              </a>
            </p>
            <p style="color:#999;font-size:12px">Para cancelar lembretes, responda este email.</p>
          `,
        });
      } catch (emailErr: any) {
        // Falha no email não bloqueia a resposta ao cliente
        console.error("[guest/lead] email error:", emailErr?.message);
      }
    }

    return res.status(201).json({ success: true });
  } catch (err: any) {
    console.error("[guest/lead] unexpected error:", err?.message);
    return res.status(500).json({ error: "Erro interno." });
  }
});

export default router;
