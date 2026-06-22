import express, { Request, Response } from "express";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { requireAuth } from "../middleware/requireAuth";
import { getSubscriptionService } from "../services/SubscriptionService";

const router = express.Router();

// Plano Anual do ecotopia — pagamento à vista (Pix/Cartão) que libera 1 ano de
// premium. Ativa ASSINATURA (access_until +365d).
const ANNUAL = {
  key: "premium_annual",
  title: "Ecotopia Premium — Plano Anual",
  price: 142.8,
  externalRefPrefix: "annualsub",
};

// Produto avulso legado (Protocolo Sono). O checkout único (R$147) foi
// descontinuado em favor da assinatura; mantemos só a chave para o webhook
// reconhecer e conceder entitlement a pagamentos `sono_*` criados antes da migração.
const LEGACY_SONO_PRODUCT_KEY = "protocolo_sono_7_noites";

// Protocolo do Sono — checkout único via Pix (tripwire do funil /sono/experiencia).
// Pagamento único, acesso vitalício às 7 noites. Preço configurável por env (sem
// redeploy de código): basta mudar SONO_PIX_PRICE_BRL no Render e reiniciar.
const SONO_PRODUCT_KEY = "protocolo_sono_7_noites";
const SONO_PIX_PRICE = Number(process.env.SONO_PIX_PRICE_BRL ?? 37);
const SONO_EXTERNAL_REF_PREFIX = "sono";

let _mpClient: MercadoPagoConfig | null = null;
let _paymentClient: Payment | null = null;
function getPaymentClient(): Payment {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error("MP_ACCESS_TOKEN missing");
  if (!_paymentClient) {
    _mpClient = new MercadoPagoConfig({ accessToken });
    _paymentClient = new Payment(_mpClient);
  }
  return _paymentClient;
}

function logInfo(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level: "info", event, ts: new Date().toISOString(), ...data }));
}
function logError(event: string, data: Record<string, unknown> = {}) {
  console.error(JSON.stringify({ level: "error", event, ts: new Date().toISOString(), ...data }));
}

// ============================================================
// Entitlement — upsert idempotente na tabela `entitlements`.
// Reusa a infra já criada para o Checkout Pro (mesma tabela,
// mesmo formato de external_reference com prefixo "sono_").
// ============================================================
async function grantEntitlement(params: {
  paymentId: string;
  externalReference: string | null | undefined;
  payerEmail: string | null | undefined;
}): Promise<void> {
  const { paymentId, externalReference, payerEmail } = params;
  try {
    const supabase = ensureSupabaseConfigured();

    // Conflict target: payment_id é UNIQUE e estável (external_reference
    // pode estar ausente se o pagamento veio de uma rota antiga).
    const row: Record<string, unknown> = {
      product_key: LEGACY_SONO_PRODUCT_KEY,
      payment_id: paymentId,
      email: payerEmail ?? null,
      status: "active",
    };
    if (externalReference) row.external_reference = externalReference;

    const { error } = await supabase
      .from("entitlements")
      .upsert(row, { onConflict: "payment_id", ignoreDuplicates: false });

    if (error) {
      logError("entitlement_upsert_failed", {
        payment_id: paymentId,
        external_reference: externalReference,
        error: error.message,
      });
      return;
    }

    logInfo("entitlement_granted", {
      payment_id: paymentId,
      external_reference: externalReference,
      product_key: LEGACY_SONO_PRODUCT_KEY,
      has_email: Boolean(payerEmail),
    });
  } catch (err: any) {
    logError("entitlement_grant_exception", {
      payment_id: paymentId,
      message: err?.message,
    });
  }
}

// external_reference do anual carrega o userId para a ativação via webhook (Pix).
function buildAnnualExternalReference(userId: string): string {
  const rand = crypto.randomBytes(3).toString("hex");
  return `${ANNUAL.externalRefPrefix}_${userId}_${Date.now()}_${rand}`;
}
function userIdFromAnnualRef(ref: string | null | undefined): string | null {
  if (!ref || !ref.startsWith(`${ANNUAL.externalRefPrefix}_`)) return null;
  const parts = ref.split("_");
  return parts[1] || null;
}

// Libera 1 ano de premium (assinatura anual paga à vista).
async function activateAnnual(userId: string, paymentId: string, method: string): Promise<void> {
  try {
    await getSubscriptionService().activateSubscription(userId, "premium_annual", 365, {
      provider: "mercadopago",
      provider_payment_id: paymentId,
      payment_status: "approved",
      payment_method: method,
      amount: ANNUAL.price,
    });
    logInfo("annual_subscription_activated", { userId, payment_id: paymentId, method });
  } catch (err: any) {
    logError("annual_activation_failed", { userId, payment_id: paymentId, message: err?.message });
  }
}

function onlyDigits(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}
function splitName(nome: unknown): { first_name: string; last_name: string } {
  const parts = String(nome ?? "").trim().split(/\s+/);
  return {
    first_name: parts[0] || "",
    last_name: parts.slice(1).join(" ") || parts[0] || "",
  };
}
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Domínio sintético usado quando o guest paga sem informar e-mail. Serve só pro MP
// aceitar a cobrança; NÃO é match do Meta e NÃO deve receber welcome email.
const SYNTHETIC_EMAIL_DOMAIN = "guest.ecotopia.app";

// IP/UA do CLIENTE (deste request) — para match do Meta no webhook. NÃO confundir
// com o IP do webhook (lá é do Mercado Pago).
function clientIpFrom(req: Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  if (Array.isArray(fwd) && fwd.length) return String(fwd[0]).trim();
  return req.ip || req.socket?.remoteAddress || null;
}
function clientUaFrom(req: Request): string | null {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" && ua.length ? ua : null;
}

function buildSonoExternalReference(guestId: string): string {
  const rand = crypto.randomBytes(3).toString("hex");
  const safeGuest = String(guestId).replace(/\s+/g, "");
  return `${SONO_EXTERNAL_REF_PREFIX}_${safeGuest}_${Date.now()}_${rand}`;
}

// =============================================================
// POST /api/payments/annual/pix  (auth)
// Plano Anual via Pix. Ativação do premium acontece no webhook.
// =============================================================
router.post("/annual/pix", requireAuth, async (req: Request, res: Response) => {
  const idempotencyKey = uuidv4();
  const userId = req.user!.id;
  try {
    const { email, nome, cpf } = req.body ?? {};
    if (!email || !nome || !cpf) {
      return res.status(400).json({ error: "INVALID_BODY", message: "email, nome e cpf são obrigatórios" });
    }
    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "INVALID_EMAIL", message: "email inválido" });
    }
    const cpfDigits = onlyDigits(cpf);
    if (cpfDigits.length !== 11) {
      return res.status(400).json({ error: "INVALID_CPF", message: "CPF deve conter 11 dígitos" });
    }

    const { first_name, last_name } = splitName(nome);
    const expiration = new Date(Date.now() + 15 * 60 * 1000);
    const external_reference = buildAnnualExternalReference(userId);

    const payment = getPaymentClient();
    const response = await payment.create({
      body: {
        transaction_amount: ANNUAL.price,
        description: ANNUAL.title,
        payment_method_id: "pix",
        date_of_expiration: expiration.toISOString(),
        external_reference,
        metadata: { product_key: ANNUAL.key, user_id: userId, payment_method: "pix" },
        payer: { email, first_name, last_name, identification: { type: "CPF", number: cpfDigits } },
      },
      requestOptions: { idempotencyKey },
    });

    const tx = response?.point_of_interaction?.transaction_data ?? {};
    logInfo("annual_pix_created", { payment_id: response.id, status: response.status, userId, external_reference });

    return res.status(200).json({
      id: response.id,
      qr_code: tx.qr_code,
      qr_code_base64: tx.qr_code_base64,
      ticket_url: tx.ticket_url,
      expiration_date: response.date_of_expiration ?? expiration.toISOString(),
      external_reference,
    });
  } catch (err: any) {
    logError("annual_pix_failed", { message: err?.message, mp_cause: err?.cause, userId, idempotencyKey });
    return res.status(502).json({ error: "PAYMENT_PROVIDER_ERROR", message: "Não foi possível gerar o Pix. Tente novamente." });
  }
});

// =============================================================
// POST /api/payments/annual/card  (auth)
// Plano Anual via cartão. Aprovado é síncrono → ativa premium na hora.
// =============================================================
router.post("/annual/card", requireAuth, async (req: Request, res: Response) => {
  const idempotencyKey = uuidv4();
  const userId = req.user!.id;
  try {
    const { token, payment_method_id, installments, payer } = req.body ?? {};
    if (!token || !payment_method_id || !installments || !payer?.email || !payer?.identification) {
      return res.status(400).json({
        error: "INVALID_BODY",
        message: "token, payment_method_id, installments e payer.{email,identification} são obrigatórios",
      });
    }
    if (typeof payer.email !== "string" || !EMAIL_RE.test(payer.email)) {
      return res.status(400).json({ error: "INVALID_EMAIL", message: "payer.email inválido" });
    }
    const installmentsNum = Number(installments);
    if (!Number.isInteger(installmentsNum) || installmentsNum < 1 || installmentsNum > 12) {
      return res.status(400).json({ error: "INVALID_INSTALLMENTS", message: "installments deve ser inteiro entre 1 e 12" });
    }
    const idNumber = onlyDigits(payer.identification.number);
    if (!idNumber) {
      return res.status(400).json({ error: "INVALID_IDENTIFICATION", message: "payer.identification.number inválido" });
    }

    const external_reference = buildAnnualExternalReference(userId);
    const payment = getPaymentClient();
    const response = await payment.create({
      body: {
        transaction_amount: ANNUAL.price,
        description: ANNUAL.title,
        token,
        payment_method_id,
        installments: installmentsNum,
        external_reference,
        metadata: { product_key: ANNUAL.key, user_id: userId },
        payer: { email: payer.email, identification: { type: payer.identification.type ?? "CPF", number: idNumber } },
      },
      requestOptions: { idempotencyKey },
    });

    if (response.status === "approved") {
      await activateAnnual(userId, String(response.id), "card");
    }

    logInfo("annual_card_created", {
      payment_id: response.id, status: response.status, status_detail: response.status_detail, userId, external_reference,
    });

    return res.status(200).json({
      id: response.id,
      status: response.status,
      status_detail: response.status_detail,
      external_reference,
    });
  } catch (err: any) {
    logError("annual_card_failed", { message: err?.message, mp_cause: err?.cause, userId, idempotencyKey });
    return res.status(502).json({ error: "PAYMENT_PROVIDER_ERROR", message: "Não foi possível processar o pagamento. Verifique os dados e tente novamente." });
  }
});

// =============================================================
// GET /api/payments/sono-pix/config  (público)
// Preço do Protocolo do Sono (Pix único). A UI lê isto para exibir o valor sem
// rebuild do frontend — mudar SONO_PIX_PRICE_BRL no backend basta.
// =============================================================
router.get("/sono-pix/config", (_req: Request, res: Response) => {
  return res.status(200).json({ price: SONO_PIX_PRICE, currency: "BRL" });
});

// =============================================================
// POST /api/payments/sono-pix  (PÚBLICO — pagamento antes da conta)
// Cria cobrança Pix única do Protocolo do Sono (7 noites, vitalício). O webhook
// concede o entitlement ao reconhecer o prefixo `sono_` no external_reference.
// O desbloqueio depende do guest_id ser idêntico de ponta a ponta:
// metadata.guest_id (aqui) → entitlement.guest_id (webhook) → /check?guest_id=.
// =============================================================
router.post("/sono-pix", async (req: Request, res: Response) => {
  const idempotencyKey = uuidv4();
  try {
    const { guest_id, purchaseEventId, fbp, fbc, cpf, email } = req.body ?? {};

    if (!guest_id || typeof guest_id !== "string") {
      return res.status(400).json({ error: "INVALID_BODY", message: "guest_id é obrigatório" });
    }

    const realEmail = typeof email === "string" && EMAIL_RE.test(email) ? email : null;
    // MP exige payer.email. Sem e-mail real (pagamento antes da conta), usamos um
    // sintético — só pro MP aceitar; o webhook ignora este domínio pro Meta/welcome.
    const payerEmail = realEmail ?? `${guest_id}@${SYNTHETIC_EMAIL_DOMAIN}`;

    const cpfDigits = onlyDigits(cpf);
    const external_reference = buildSonoExternalReference(guest_id);
    const expiration = new Date(Date.now() + 30 * 60 * 1000);
    const client_ip = clientIpFrom(req);
    const client_ua = clientUaFrom(req);

    const payerBody: Record<string, unknown> = { email: payerEmail };
    // CPF só vai se vier (alguns ambientes do MP exigem para Pix; testar no sandbox).
    if (cpfDigits.length === 11) {
      payerBody.identification = { type: "CPF", number: cpfDigits };
    }

    const payment = getPaymentClient();
    const response = await payment.create({
      body: {
        transaction_amount: SONO_PIX_PRICE,
        description: "Protocolo do Sono — 7 noites (acesso vitalício)",
        payment_method_id: "pix",
        date_of_expiration: expiration.toISOString(),
        external_reference,
        metadata: {
          product_key: SONO_PRODUCT_KEY,
          type: "sono_7noites_lifetime",
          guest_id,
          purchase_event_id: purchaseEventId ?? null,
          fbp: fbp ?? null,
          fbc: fbc ?? null,
          client_ip,
          client_ua,
        },
        payer: payerBody,
      },
      requestOptions: { idempotencyKey },
    });

    const tx = response?.point_of_interaction?.transaction_data ?? {};
    logInfo("sono_pix_created", {
      payment_id: response.id,
      status: response.status,
      guest_id,
      external_reference,
      price: SONO_PIX_PRICE,
    });

    return res.status(200).json({
      id: response.id,
      qr_code: tx.qr_code,
      qr_code_base64: tx.qr_code_base64,
      external_reference,
      expiration_date: response.date_of_expiration ?? expiration.toISOString(),
    });
  } catch (err: any) {
    logError("sono_pix_failed", { message: err?.message, mp_cause: err?.cause, idempotencyKey });
    return res.status(502).json({ error: "PAYMENT_PROVIDER_ERROR", message: "Não foi possível gerar o Pix. Tente novamente." });
  }
});

// =============================================================
// GET /api/payments/status/:id
// Usado pelo polling do frontend (Pix) para detectar aprovação.
// =============================================================
router.get("/status/:id", async (req: Request, res: Response) => {
  const paymentId = req.params.id;
  try {
    if (!paymentId || !/^\d+$/.test(paymentId)) {
      return res.status(400).json({ error: "INVALID_ID", message: "id de pagamento inválido" });
    }

    const payment = getPaymentClient();
    const detail = await payment.get({ id: paymentId });

    return res.status(200).json({
      id: detail.id,
      status: detail.status,
      status_detail: detail.status_detail,
    });
  } catch (err: any) {
    logError("payment_status_failed", {
      message: err?.message,
      payment_id: paymentId,
    });
    return res.status(502).json({
      error: "PAYMENT_PROVIDER_ERROR",
      message: "Não foi possível consultar o pagamento.",
    });
  }
});

// =============================================================
// POST /api/payments/webhook
// Valida x-signature (HMAC-SHA256) usando MP_WEBHOOK_SECRET.
// =============================================================
function verifyMpSignature(req: Request): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return false;

  const signatureHeader = req.headers["x-signature"];
  const requestId = req.headers["x-request-id"];
  if (!signatureHeader || !requestId || typeof signatureHeader !== "string" || typeof requestId !== "string") {
    return false;
  }

  const parts = signatureHeader.split(",").reduce<Record<string, string>>((acc, p) => {
    const [k, v] = p.split("=");
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});

  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const dataId = (req.query["data.id"] as string | undefined) ?? req.body?.data?.id;
  if (!dataId) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(v1, "hex"));
  } catch {
    return false;
  }
}

router.post("/webhook", async (req: Request, res: Response) => {
  try {
    if (!verifyMpSignature(req)) {
      logError("webhook_signature_invalid", {
        request_id: (req.headers["x-request-id"] as string | undefined) ?? null,
      });
      return res.status(401).json({ error: "INVALID_SIGNATURE" });
    }

    const type = req.body?.type ?? req.query.type;
    const dataId = req.body?.data?.id ?? req.query["data.id"];
    logInfo("webhook_received", { type, data_id: dataId });

    res.status(200).json({ received: true });

    if (type === "payment" && dataId) {
      try {
        const payment = getPaymentClient();
        const detail = await payment.get({ id: String(dataId) });

        logInfo("webhook_payment_detail", {
          payment_id: detail.id,
          status: detail.status,
          status_detail: detail.status_detail,
          external_reference: detail.external_reference,
        });

        if (detail.status === "approved") {
          const annualUserId = userIdFromAnnualRef(detail.external_reference);
          if (annualUserId) {
            // Plano Anual via Pix → ativa premium por 1 ano.
            logInfo("webhook_annual_approved", {
              payment_id: detail.id,
              userId: annualUserId,
              external_reference: detail.external_reference,
            });
            await activateAnnual(annualUserId, String(detail.id), "pix");
          } else {
            // Produto avulso legado (sono) → entitlement.
            logInfo("webhook_payment_approved", {
              payment_id: detail.id,
              payer_email: detail.payer?.email,
              external_reference: detail.external_reference,
            });
            await grantEntitlement({
              paymentId: String(detail.id),
              externalReference: detail.external_reference,
              payerEmail: detail.payer?.email,
            });
          }
        }
      } catch (innerErr: any) {
        logError("webhook_payment_fetch_failed", {
          message: innerErr?.message,
          data_id: dataId,
        });
      }
    }
  } catch (err: any) {
    logError("webhook_handler_failed", { message: err?.message });
    if (!res.headersSent) {
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
});

export default router;
