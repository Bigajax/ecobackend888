import type { Request, Response } from "express";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { log } from "../services/promptContext/logger";

const logger = log.withContext("leads-controller");

interface LeadUtm {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

interface LeadBody {
  email?: string;
  source?: string;
  utm?: LeadUtm;
  referrer?: string;
  landing_path?: string;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getClientIp(req: Request): string | null {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string") return xff.split(",")[0].trim();
  if (Array.isArray(xff) && xff.length) return xff[0].split(",")[0].trim();
  return req.socket?.remoteAddress ?? null;
}

/**
 * POST /api/leads/sono-noite1
 *
 * Captura email da landing do Protocolo Sono (Noite 1 grátis).
 * Rota PÚBLICA — sem auth.
 *
 * Idempotência: upsert por email com `ignoreDuplicates: true` —
 * o primeiro UTM/source é preservado (first-touch attribution).
 *
 * Fire-and-forget compatible: sempre retorna 200, mesmo em erro de DB,
 * para não bloquear a experiência da landing.
 *
 * Body: { email, source?, utm?, referrer?, landing_path? }
 */
export async function createSonoLead(req: Request, res: Response) {
  try {
    const body: LeadBody = req.body ?? {};
    const email = (body.email ?? "").trim().toLowerCase();

    if (!email || !isValidEmail(email)) {
      logger.warn("invalid_email", { emailLength: email.length });
      return res.status(400).json({ error: "INVALID_EMAIL", message: "Email inválido" });
    }

    const supabase = ensureSupabaseConfigured();
    const utm = body.utm ?? {};

    const lead = {
      email,
      source: body.source ?? "sono_landing_hero",
      landing_path: body.landing_path ?? null,
      referrer: body.referrer ?? null,
      utm_source: utm.source ?? null,
      utm_medium: utm.medium ?? null,
      utm_campaign: utm.campaign ?? null,
      utm_term: utm.term ?? null,
      utm_content: utm.content ?? null,
      ip: getClientIp(req),
      user_agent: req.headers["user-agent"] ?? null,
      status: "new" as const,
    };

    const { error } = await supabase
      .from("sono_leads")
      .upsert(lead, { onConflict: "email", ignoreDuplicates: true });

    if (error) {
      logger.error("create_lead_db_error", { email, error: error.message });
      // Fire-and-forget — não bloqueia o usuário. Retorna 200 mesmo em falha db.
      return res.status(200).json({ ok: true });
    }

    logger.info("lead_captured", {
      email,
      source: lead.source,
      utm_campaign: lead.utm_campaign,
    });
    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error("create_sono_lead_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    // Sempre 200 — landing não bloqueia experiência por erro de tracking
    return res.status(200).json({ ok: true });
  }
}
