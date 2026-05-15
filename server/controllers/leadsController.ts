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
  name?: string;
  phone?: string;
  marketing_consent?: boolean;
  source?: string;
  utm?: LeadUtm;
  referrer?: string;
  landing_path?: string;
}

// RFC 5322 simplificado: rejeita pontos consecutivos, espacos, TLD < 2 chars.
const EMAIL_REGEX =
  /^[A-Za-z0-9](?:[A-Za-z0-9._+-]*[A-Za-z0-9])?@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+\.[A-Za-z]{2,}$/;

// Dominios descartaveis / temporarios mais comuns. Lead falso = remarketing perdido.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "tempmail.com",
  "temp-mail.org",
  "guerrillamail.com",
  "guerrillamail.info",
  "10minutemail.com",
  "10minutemail.net",
  "yopmail.com",
  "trashmail.com",
  "throwawaymail.com",
  "fakeinbox.com",
  "getairmail.com",
  "maildrop.cc",
  "sharklasers.com",
  "grr.la",
  "dispostable.com",
  "mintemail.com",
  "spambox.us",
  "mailnesia.com",
  "mohmal.com",
  "tempr.email",
  "emailondeck.com",
  "tempmailaddress.com",
  "discard.email",
  "moakt.com",
  "throwam.com",
  "boun.cr",
  "trash-mail.com",
]);

function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  if (!EMAIL_REGEX.test(email)) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  if (DISPOSABLE_DOMAINS.has(domain)) return false;
  return true;
}

function isDisposable(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && DISPOSABLE_DOMAINS.has(domain);
}

function normalizeName(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2 || trimmed.length > 80) return null;
  // Aceita letras (com acentos), espacos, hifens e apostrofos. Bloqueia digitos/URLs/emoji.
  if (!/^[\p{L} '\-.]+$/u.test(trimmed)) return null;
  return trimmed;
}

/**
 * Normaliza celular brasileiro para E.164 (+55DDDNUMERO).
 * Aceita formatos: (11) 91234-5678, 11912345678, +5511912345678, etc.
 * Retorna null se nao for um celular BR valido (10 ou 11 digitos sem DDI).
 */
function normalizePhoneBR(raw: string): { display: string; e164: string } | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  let local = digits;
  if (digits.startsWith("55") && digits.length >= 12) {
    local = digits.slice(2);
  }

  // Celular BR: 11 digitos (DDD + 9 + 8 digitos). Tambem aceita fixo de 10 digitos.
  if (local.length !== 10 && local.length !== 11) return null;

  const ddd = parseInt(local.slice(0, 2), 10);
  // DDDs validos no Brasil: 11-99 (alguns nao alocados, mas a faixa cobre).
  if (ddd < 11 || ddd > 99) return null;

  // Celular (11 digitos) precisa comecar com 9 apos o DDD
  if (local.length === 11 && local[2] !== "9") return null;

  const e164 = `+55${local}`;
  const display =
    local.length === 11
      ? `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
      : `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;

  return { display, e164 };
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
 * Captura lead da landing do Protocolo Sono (Noite 1 gratis).
 * Rota PUBLICA — sem auth.
 *
 * Validacao anti-fraude:
 *  - Email com regex rigorosa + bloqueio de dominios descartaveis
 *  - Nome: 2-80 chars, letras/acentos/hifens (bloqueia digitos e URLs)
 *  - Celular BR: 10 ou 11 digitos, DDD valido, celular com 9 inicial
 *  - marketing_consent: opt-in explicito (LGPD)
 *
 * Idempotencia: se email ja existe, atualiza apenas contato/consentimento;
 * preserva UTM/source/referrer da primeira captura (first-touch attribution).
 */
export async function createSonoLead(req: Request, res: Response) {
  try {
    const body: LeadBody = req.body ?? {};
    const email = (body.email ?? "").trim().toLowerCase();

    if (!email || !isValidEmail(email)) {
      const reason = !email
        ? "empty"
        : isDisposable(email)
        ? "disposable"
        : "format";
      logger.warn("invalid_email", { reason, emailLength: email.length });
      return res.status(400).json({
        error: "INVALID_EMAIL",
        message:
          reason === "disposable"
            ? "Use um email permanente para receber a Noite 1."
            : "Email invalido. Confira se digitou corretamente.",
      });
    }

    const name = body.name ? normalizeName(body.name) : null;
    if (!name) {
      logger.warn("invalid_name", { email });
      return res.status(400).json({
        error: "INVALID_NAME",
        message: "Informe seu nome (apenas letras).",
      });
    }

    const phoneNormalized = body.phone ? normalizePhoneBR(body.phone) : null;
    if (!phoneNormalized) {
      logger.warn("invalid_phone", { email });
      return res.status(400).json({
        error: "INVALID_PHONE",
        message: "Celular invalido. Use DDD + numero (ex.: 11912345678).",
      });
    }

    if (body.marketing_consent !== true) {
      logger.warn("missing_marketing_consent", { email });
      return res.status(400).json({
        error: "MISSING_CONSENT",
        message: "Marque a autorizacao de envio para receber a Noite 1.",
      });
    }

    const supabase = ensureSupabaseConfigured();
    const utm = body.utm ?? {};
    const ip = getClientIp(req);
    const userAgent = req.headers["user-agent"] ?? null;
    const nowIso = new Date().toISOString();

    // Verifica se ja existe (preserva first-touch UTM/source).
    const { data: existing, error: selectError } = await supabase
      .from("sono_leads")
      .select("id, marketing_consent")
      .eq("email", email)
      .maybeSingle();

    if (selectError) {
      logger.error("lead_lookup_db_error", { email, error: selectError.message });
      // Fire-and-forget — landing nao bloqueia.
      return res.status(200).json({ ok: true });
    }

    if (existing) {
      // Atualiza apenas contato/consentimento. UTM/source/landing/referrer/ip ficam intactos.
      const updatePayload: Record<string, unknown> = {
        name,
        phone: phoneNormalized.display,
        phone_e164: phoneNormalized.e164,
        marketing_consent: true,
        marketing_consent_at: existing.marketing_consent ? undefined : nowIso,
        marketing_consent_ip: existing.marketing_consent ? undefined : ip,
      };
      // Remove undefined para nao sobrescrever timestamp de consentimento original.
      Object.keys(updatePayload).forEach(
        (k) => updatePayload[k] === undefined && delete updatePayload[k],
      );

      const { error: updateError } = await supabase
        .from("sono_leads")
        .update(updatePayload)
        .eq("id", existing.id);

      if (updateError) {
        logger.error("lead_update_db_error", { email, error: updateError.message });
        return res.status(200).json({ ok: true });
      }

      logger.info("lead_updated", { email, hadConsent: existing.marketing_consent });
      return res.status(200).json({ ok: true });
    }

    const lead = {
      email,
      name,
      phone: phoneNormalized.display,
      phone_e164: phoneNormalized.e164,
      marketing_consent: true,
      marketing_consent_at: nowIso,
      marketing_consent_ip: ip,
      source: body.source ?? "sono_landing_hero",
      landing_path: body.landing_path ?? null,
      referrer: body.referrer ?? null,
      utm_source: utm.source ?? null,
      utm_medium: utm.medium ?? null,
      utm_campaign: utm.campaign ?? null,
      utm_term: utm.term ?? null,
      utm_content: utm.content ?? null,
      ip,
      user_agent: userAgent,
      status: "new" as const,
    };

    const { error: insertError } = await supabase.from("sono_leads").insert(lead);

    if (insertError) {
      logger.error("create_lead_db_error", { email, error: insertError.message });
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
    return res.status(200).json({ ok: true });
  }
}
