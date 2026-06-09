import type { Request, Response } from "express";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { log } from "../services/promptContext/logger";

const logger = log.withContext("newsletter-controller");

interface NewsletterUtm {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

interface NewsletterBody {
  email?: string;
  source?: string;
  utm?: NewsletterUtm;
  referrer?: string;
  landing_path?: string;
}

// RFC 5322 simplificado: rejeita pontos consecutivos, espacos, TLD < 2 chars.
const EMAIL_REGEX =
  /^[A-Za-z0-9](?:[A-Za-z0-9._+-]*[A-Za-z0-9])?@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+\.[A-Za-z]{2,}$/;

// Mesma blocklist do leadsController para bloquear dominios descartaveis.
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

function getClientIp(req: Request): string | null {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string") return xff.split(",")[0].trim();
  if (Array.isArray(xff) && xff.length) return xff[0].split(",")[0].trim();
  return req.socket?.remoteAddress ?? null;
}

/**
 * POST /api/leads/newsletter
 *
 * Inscricao na newsletter geral do Ecotopia (footer "Fique por dentro").
 * Rota PUBLICA — sem auth.
 *
 * Idempotente: se email ja existe e esta 'subscribed', retorna 200 sem erro.
 * Se estava 'unsubscribed', reativa (status='subscribed', unsubscribed_at=NULL).
 * Preserva first-touch (source/utm/landing/referrer da primeira inscricao).
 */
export async function subscribeNewsletter(req: Request, res: Response) {
  try {
    const body: NewsletterBody = req.body ?? {};
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
            ? "Use um e-mail permanente para receber as novidades."
            : "E-mail invalido. Confira se digitou corretamente.",
      });
    }

    const supabase = ensureSupabaseConfigured();
    const utm = body.utm ?? {};
    const ip = getClientIp(req);
    const userAgent = req.headers["user-agent"] ?? null;

    // Verifica se ja existe (preserva first-touch UTM/source).
    const { data: existing, error: selectError } = await supabase
      .from("newsletter_subscribers")
      .select("id, status")
      .eq("email", email)
      .maybeSingle();

    if (selectError) {
      logger.error("subscriber_lookup_db_error", {
        email,
        error: selectError.message,
      });
      // Fire-and-forget — UI nao bloqueia em erro de DB.
      return res.status(200).json({ ok: true });
    }

    if (existing) {
      // Reativa se estava unsubscribed; senao retorna ok silenciosamente.
      if (existing.status === "unsubscribed") {
        const { error: updateError } = await supabase
          .from("newsletter_subscribers")
          .update({ status: "subscribed", unsubscribed_at: null })
          .eq("id", existing.id);

        if (updateError) {
          logger.error("subscriber_resubscribe_db_error", {
            email,
            error: updateError.message,
          });
          return res.status(200).json({ ok: true });
        }
        logger.info("subscriber_resubscribed", { email });
      } else {
        logger.info("subscriber_already_subscribed", { email });
      }
      return res.status(200).json({ ok: true, already: true });
    }

    const subscriber = {
      email,
      source: body.source ?? "newsletter_footer",
      landing_path: body.landing_path ?? null,
      referrer: body.referrer ?? null,
      utm_source: utm.source ?? null,
      utm_medium: utm.medium ?? null,
      utm_campaign: utm.campaign ?? null,
      utm_term: utm.term ?? null,
      utm_content: utm.content ?? null,
      ip,
      user_agent: userAgent,
      status: "subscribed" as const,
    };

    const { error: insertError } = await supabase
      .from("newsletter_subscribers")
      .insert(subscriber);

    if (insertError) {
      logger.error("create_subscriber_db_error", {
        email,
        error: insertError.message,
      });
      return res.status(200).json({ ok: true });
    }

    logger.info("subscriber_created", {
      email,
      source: subscriber.source,
      utm_campaign: subscriber.utm_campaign,
    });
    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error("subscribe_newsletter_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(200).json({ ok: true });
  }
}
