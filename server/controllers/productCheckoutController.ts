import type { Request, Response } from "express";
import crypto from "crypto";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { log } from "../services/promptContext/logger";

const logger = log.withContext("product-checkout-controller");

interface ProductConfig {
  title: string;
  description: string;
  price: number;
  externalRefPrefix: string;
  successPath: string;
  failurePath: string;
  statementDescriptor: string;
}

const ALLOWED_PRODUCTS: Record<string, ProductConfig> = {
  protocolo_sono_7_noites: {
    title: "Protocolo Sono Profundo – 7 noites",
    description: "7 meditações guiadas progressivas para recondicionar seu sono",
    price: 97.0,
    externalRefPrefix: "sono",
    successPath: "/sono/obrigado",
    failurePath: "/sono/erro",
    statementDescriptor: "ECO Protocolo Sono",
  },
  protocolo_abundancia_7_dias: {
    title: "Código da Abundância – 7 dias",
    description: "7 meditações guiadas para reprogramar crenças sobre dinheiro e prosperidade",
    price: 67.0,
    externalRefPrefix: "abundancia",
    successPath: "/abundancia/obrigado",
    failurePath: "/",
    statementDescriptor: "ECO Código Abundância",
  },
  dr_joe_colecao: {
    title: "Dr. Joe Dispenza — Meditações ECO",
    description: "Meditações guiadas para sustentar um novo estado mental e emocional",
    price: 37.0,
    externalRefPrefix: "drjoe",
    successPath: "/dr-joe/obrigado",
    failurePath: "/dr-joe/erro",
    statementDescriptor: "ECO Dr Joe",
  },
};

// Cache dos clientes MP — inicializados uma vez por processo, não por request
let _mpClient: MercadoPagoConfig | null = null;
let _preferenceClient: Preference | null = null;

function getMpClients(): { client: MercadoPagoConfig; preferenceClient: Preference } {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("MP_ACCESS_TOKEN is required");
  }
  if (!_mpClient || !_preferenceClient) {
    _mpClient = new MercadoPagoConfig({ accessToken });
    _preferenceClient = new Preference(_mpClient);
    logger.info("mp_clients_initialized");
  }
  return { client: _mpClient, preferenceClient: _preferenceClient };
}

function buildExternalReference(prefix: string): string {
  const rand = crypto.randomBytes(3).toString("hex");
  return `${prefix}_${Date.now()}_${rand}`;
}

/**
 * POST /api/mp/create-preference
 *
 * Cria uma Preference do Mercado Pago para produtos avulsos.
 * Rota PÚBLICA — não requer autenticação.
 *
 * Body: { productKey, origin?, utm? }
 * Returns: { init_point, external_reference }
 */
export async function createProductPreference(req: Request, res: Response) {
  try {
    const { productKey, origin, utm, siteUrl } = req.body ?? {};

    const product = ALLOWED_PRODUCTS[productKey as string];
    if (!product) {
      logger.warn("invalid_product_key", { productKey });
      return res.status(400).json({
        error: "INVALID_PRODUCT_KEY",
        message: `productKey inválido. Use: ${Object.keys(ALLOWED_PRODUCTS).join(", ")}`,
      });
    }

    let preferenceClient: Preference;
    try {
      ({ preferenceClient } = getMpClients());
    } catch {
      logger.error("mp_access_token_missing");
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Configuração de pagamento ausente" });
    }

    const appUrl = siteUrl || process.env.APP_URL || "https://ecotopia.com";
    const backendUrl = process.env.BACKEND_URL || "https://ecobackend888.onrender.com";
    const webhookUrl = process.env.WEBHOOK_URL || `${backendUrl}/api/webhooks/mercadopago`;

    const external_reference = buildExternalReference(product.externalRefPrefix);

    const response = await preferenceClient.create({
      body: {
        items: [
          {
            id: productKey,
            title: product.title,
            description: product.description,
            quantity: 1,
            unit_price: product.price,
            currency_id: "BRL",
          },
        ],
        external_reference,
        metadata: {
          product_key: productKey,
          origin: origin ?? "app",
          utm: utm ?? null,
        },
        back_urls: {
          success: `${appUrl}${product.successPath}`,
          pending: `${appUrl}${product.successPath}`,
          failure: `${appUrl}${product.failurePath}`,
        },
        auto_return: "approved",
        notification_url: webhookUrl,
        statement_descriptor: product.statementDescriptor,
      },
    });

    if (!response.init_point) {
      logger.error("mp_preference_missing_init_point", { external_reference, productKey });
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erro ao criar preferência" });
    }

    logger.info("product_preference_created", { external_reference, productKey, origin });

    return res.status(200).json({
      init_point: response.init_point,
      preference_id: response.id,
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
