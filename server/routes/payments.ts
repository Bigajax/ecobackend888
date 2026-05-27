import express, { Request, Response } from "express";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { requireAuth } from "../middleware/requireAuth";
import { getSubscriptionService } from "../services/SubscriptionService";

const router = express.Router();

// Plano Anual do ecotopia — pagamento à vista (Pix/Cartão) que libera 1 ano de
// premium. Diferente do produto avulso `sono` abaixo: aqui ativamos ASSINATURA
// (access_until +365d) em vez de conceder entitlement.
const ANNUAL = {
  key: "premium_annual",
  title: "Ecotopia Premium — Plano Anual",
  price: 142.8,
  externalRefPrefix: "annualsub",
};

const PRODUCT = {
  key: "protocolo_sono_7_noites",
  title: "Protocolo Sono Profundo - 7 Noites",
  price: 147.0,
  // Desconto aplicado quando o método de pagamento é Pix.
  // Pix tem custo de processamento menor, então repassamos parte ao cliente.
  pixDiscountPct: 10,
  externalRefPrefix: "sono",
};

// Preço final do Pix com o desconto aplicado.
// Centralizado para que toda a base use o mesmo cálculo (consistente com o frontend).
function getPixPrice(): number {
  return Number((PRODUCT.price * (1 - PRODUCT.pixDiscountPct / 100)).toFixed(2));
}

function buildExternalReference(): string {
  const rand = crypto.randomBytes(3).toString("hex");
  return `${PRODUCT.externalRefPrefix}_${Date.now()}_${rand}`;
}

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
      product_key: PRODUCT.key,
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
      product_key: PRODUCT.key,
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

// =============================================================
// POST /api/payments/pix
// Body: { email, nome, cpf }
// =============================================================
router.post("/pix", async (req: Request, res: Response) => {
  const idempotencyKey = uuidv4();
  try {
    const { email, nome, cpf } = req.body ?? {};

    if (!email || !nome || !cpf) {
      return res.status(400).json({
        error: "INVALID_BODY",
        message: "email, nome e cpf são obrigatórios",
      });
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
    const external_reference = buildExternalReference();

    // Preço sempre calculado server-side. Nunca confiar em valor vindo do body
    // (front não envia amount — mas mesmo se enviasse seria ignorado).
    const amount = getPixPrice();
    const description = `${PRODUCT.title} (Pix ${PRODUCT.pixDiscountPct}% off)`;

    const payment = getPaymentClient();
    const response = await payment.create({
      body: {
        transaction_amount: amount,
        description,
        payment_method_id: "pix",
        date_of_expiration: expiration.toISOString(),
        external_reference,
        metadata: {
          product_key: PRODUCT.key,
          payment_method: "pix",
          base_price: PRODUCT.price,
          discount_pct: PRODUCT.pixDiscountPct,
          final_price: amount,
        },
        payer: {
          email,
          first_name,
          last_name,
          identification: { type: "CPF", number: cpfDigits },
        },
      },
      requestOptions: { idempotencyKey },
    });

    const tx = response?.point_of_interaction?.transaction_data ?? {};

    logInfo("pix_payment_created", {
      payment_id: response.id,
      status: response.status,
      external_reference,
      base_price: PRODUCT.price,
      discount_pct: PRODUCT.pixDiscountPct,
      final_amount: amount,
      idempotencyKey,
    });

    return res.status(200).json({
      id: response.id,
      qr_code: tx.qr_code,
      qr_code_base64: tx.qr_code_base64,
      ticket_url: tx.ticket_url,
      expiration_date: response.date_of_expiration ?? expiration.toISOString(),
      external_reference,
    });
  } catch (err: any) {
    logError("pix_payment_failed", {
      message: err?.message,
      mp_cause: err?.cause,
      idempotencyKey,
    });
    return res.status(502).json({
      error: "PAYMENT_PROVIDER_ERROR",
      message: "Não foi possível gerar o Pix. Tente novamente em instantes.",
    });
  }
});

// =============================================================
// POST /api/payments/card
// Body: { token, payment_method_id, installments, payer: { email, identification } }
// O token vem do SDK do MP no browser — cartão NUNCA passa por aqui.
// =============================================================
router.post("/card", async (req: Request, res: Response) => {
  const idempotencyKey = uuidv4();
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
    if (!Number.isInteger(installmentsNum) || installmentsNum < 1 || installmentsNum > 3) {
      return res.status(400).json({
        error: "INVALID_INSTALLMENTS",
        message: "installments deve ser inteiro entre 1 e 3",
      });
    }

    const idNumber = onlyDigits(payer.identification.number);
    if (!idNumber) {
      return res.status(400).json({
        error: "INVALID_IDENTIFICATION",
        message: "payer.identification.number inválido",
      });
    }

    const external_reference = buildExternalReference();
    const payment = getPaymentClient();
    const response = await payment.create({
      body: {
        transaction_amount: PRODUCT.price,
        description: PRODUCT.title,
        token,
        payment_method_id,
        installments: installmentsNum,
        external_reference,
        metadata: { product_key: PRODUCT.key },
        payer: {
          email: payer.email,
          identification: {
            type: payer.identification.type ?? "CPF",
            number: idNumber,
          },
        },
      },
      requestOptions: { idempotencyKey },
    });

    // Cartão aprovado é síncrono: libera entitlement já na resposta para não
    // depender do webhook (que pode demorar segundos ou falhar).
    if (response.status === "approved") {
      await grantEntitlement({
        paymentId: String(response.id),
        externalReference: external_reference,
        payerEmail: payer.email,
      });
    }

    logInfo("card_payment_created", {
      payment_id: response.id,
      status: response.status,
      status_detail: response.status_detail,
      external_reference,
      idempotencyKey,
    });

    return res.status(200).json({
      id: response.id,
      status: response.status,
      status_detail: response.status_detail,
      external_reference,
    });
  } catch (err: any) {
    logError("card_payment_failed", {
      message: err?.message,
      mp_cause: err?.cause,
      idempotencyKey,
    });
    return res.status(502).json({
      error: "PAYMENT_PROVIDER_ERROR",
      message: "Não foi possível processar o pagamento. Verifique os dados e tente novamente.",
    });
  }
});

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
