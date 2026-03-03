import type { Request, Response } from "express";
import crypto from "crypto";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { log } from "../services/promptContext/logger";

const logger = log.withContext("product-checkout-controller");

const PRODUCT_KEY = "protocolo_sono_7_noites";

function buildExternalReference(): string {
  const rand = crypto.randomBytes(3).toString("hex");
  return `sono_${Date.now()}_${rand}`;
}

/**
 * POST /api/mp/create-preference
 *
 * Cria uma Preference do Mercado Pago para o produto avulso Protocolo Sono.
 * Rota PÚBLICA — não requer autenticação.
 *
 * Body: { productKey, origin?, utm? }
 * Returns: { init_point, external_reference }
 */
export async function createProductPreference(req: Request, res: Response) {
  try {
    const { productKey, origin, utm } = req.body ?? {};

    if (productKey !== PRODUCT_KEY) {
      logger.warn("invalid_product_key", { productKey });
      return res.status(400).json({
        error: "INVALID_PRODUCT_KEY",
        message: `productKey inválido. Use '${PRODUCT_KEY}'`,
      });
    }

    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      logger.error("mp_access_token_missing");
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Configuração de pagamento ausente" });
    }

    const appUrl = process.env.APP_URL || "https://ecotopia.com";
    const backendUrl = process.env.BACKEND_URL || "https://ecobackend888.onrender.com";
    const webhookUrl = process.env.WEBHOOK_URL || `${backendUrl}/api/webhooks/mercadopago`;

    const external_reference = buildExternalReference();

    const client = new MercadoPagoConfig({ accessToken });
    const preferenceClient = new Preference(client);

    const response = await preferenceClient.create({
      body: {
        items: [
          {
            id: PRODUCT_KEY,
            title: "Protocolo Sono Profundo – 7 noites",
            description: "7 meditações guiadas progressivas para recondicionar seu sono",
            quantity: 1,
            unit_price: 37.0,
            currency_id: "BRL",
          },
        ],
        external_reference,
        metadata: { productKey, origin: origin ?? "landing", utm: utm ?? null },
        back_urls: {
          success: `${appUrl}/sono/obrigado`,
          pending: `${appUrl}/sono/obrigado`,
          failure: `${appUrl}/sono/erro`,
        },
        auto_return: "approved",
        notification_url: webhookUrl,
        statement_descriptor: "ECO Protocolo Sono",
      },
    });

    if (!response.init_point) {
      logger.error("mp_preference_missing_init_point", { external_reference });
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erro ao criar preferência" });
    }

    logger.info("product_preference_created", { external_reference, origin });

    return res.status(200).json({
      init_point: response.init_point,
      external_reference,
    });
  } catch (error) {
    logger.error("create_product_preference_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Erro ao criar preferência de pagamento",
    });
  }
}
