import express, { Request, Response } from "express";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { MercadoPagoConfig, Payment } from "mercadopago";

const router = express.Router();

const PRODUCT = {
  title: "Protocolo Sono Profundo - 7 Noites",
  price: 147.0,
};

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

    const payment = getPaymentClient();
    const response = await payment.create({
      body: {
        transaction_amount: PRODUCT.price,
        description: PRODUCT.title,
        payment_method_id: "pix",
        date_of_expiration: expiration.toISOString(),
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
      idempotencyKey,
    });

    return res.status(200).json({
      id: response.id,
      qr_code: tx.qr_code,
      qr_code_base64: tx.qr_code_base64,
      ticket_url: tx.ticket_url,
      expiration_date: response.date_of_expiration ?? expiration.toISOString(),
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

    const payment = getPaymentClient();
    const response = await payment.create({
      body: {
        transaction_amount: PRODUCT.price,
        description: PRODUCT.title,
        token,
        payment_method_id,
        installments: installmentsNum,
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

    logInfo("card_payment_created", {
      payment_id: response.id,
      status: response.status,
      status_detail: response.status_detail,
      idempotencyKey,
    });

    return res.status(200).json({
      id: response.id,
      status: response.status,
      status_detail: response.status_detail,
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
          // TODO: liberar acesso ao Protocolo Sono Profundo para detail.payer?.email
          //       (gravar em DB, enviar email com link/credenciais, etc.)
          logInfo("webhook_payment_approved", {
            payment_id: detail.id,
            payer_email: detail.payer?.email,
            external_reference: detail.external_reference,
          });
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
