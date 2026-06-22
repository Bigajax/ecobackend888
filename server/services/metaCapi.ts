import crypto from "crypto";
import axios from "axios";
import { log } from "./promptContext/logger";

const logger = log.withContext("meta-capi");

const GRAPH_VERSION = "v21.0";

function getConfig() {
  const pixelId = process.env.META_PIXEL_ID;
  // META_CAPI_TOKEN é o nome canônico (spec); aceitamos META_ACCESS_TOKEN como
  // fallback para alinhar com o nome usado pela função serverless do frontend.
  const accessToken = process.env.META_CAPI_TOKEN || process.env.META_ACCESS_TOKEN;
  const testEventCode = process.env.META_TEST_EVENT_CODE || undefined;
  return { pixelId, accessToken, testEventCode };
}

/** SHA-256 de um valor normalizado (trim + lowercase), como exige a Meta. */
function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

/** Normaliza telefone para dígitos antes do hash (mantém DDI/DDD). */
function hashPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return crypto.createHash("sha256").update(digits).digest("hex");
}

export interface MetaUserData {
  email?: string | null;
  phone?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  /** Identificador estável do usuário/guest (ex.: guest_id) — hasheado SHA-256. */
  externalId?: string | null;
}

export interface MetaCustomData {
  value?: number;
  currency?: string;
  contentName?: string;
  contentCategory?: string;
  contentIds?: string[];
  contentType?: string;
}

export interface SendMetaEventParams {
  eventName: string;
  /** UUID correlacionado ao client para deduplicação (event_id). */
  eventId: string;
  eventSourceUrl?: string | null;
  userData: MetaUserData;
  customData?: MetaCustomData;
}

/**
 * Envia um evento server-side para a Conversions API da Meta
 * (Graph API /{PIXEL_ID}/events). Fonte da verdade para conversões confirmadas
 * pelo Mercado Pago (StartTrial/Subscribe).
 *
 * Não-fatal: nunca lança — em caso de erro apenas loga, para não quebrar o
 * webhook do Mercado Pago.
 */
export async function sendMetaEvent(params: SendMetaEventParams): Promise<void> {
  const { pixelId, accessToken, testEventCode } = getConfig();

  if (!pixelId || !accessToken) {
    logger.warn("meta_capi_not_configured", {
      hasPixel: Boolean(pixelId),
      hasToken: Boolean(accessToken),
      eventName: params.eventName,
    });
    return;
  }

  const { eventName, eventId, eventSourceUrl, userData, customData } = params;

  // user_data — PII com hash SHA-256; cookies/ip/ua sem hash.
  const user_data: Record<string, unknown> = {};
  if (userData.email) user_data.em = [sha256(userData.email)];
  if (userData.phone) user_data.ph = [hashPhone(userData.phone)];
  if (userData.fbp) user_data.fbp = userData.fbp;
  if (userData.fbc) user_data.fbc = userData.fbc;
  if (userData.clientIpAddress) user_data.client_ip_address = userData.clientIpAddress;
  if (userData.clientUserAgent) user_data.client_user_agent = userData.clientUserAgent;
  if (userData.externalId) user_data.external_id = [sha256(userData.externalId)];

  const custom_data: Record<string, unknown> = {};
  if (customData?.value !== undefined && customData?.currency) {
    custom_data.value = customData.value;
    custom_data.currency = customData.currency;
  }
  if (customData?.contentName) custom_data.content_name = customData.contentName;
  if (customData?.contentCategory) custom_data.content_category = customData.contentCategory;
  if (customData?.contentIds?.length) {
    custom_data.content_ids = customData.contentIds;
    custom_data.content_type = customData.contentType || "product";
  }

  const serverEvent: Record<string, unknown> = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: "website",
    user_data,
  };
  if (eventSourceUrl) serverEvent.event_source_url = eventSourceUrl;
  if (Object.keys(custom_data).length > 0) serverEvent.custom_data = custom_data;

  const payload: Record<string, unknown> = { data: [serverEvent] };
  if (testEventCode) payload.test_event_code = testEventCode;

  if (process.env.NODE_ENV !== "production") {
    logger.debug("meta_capi_payload", { eventName, eventId, payload });
  }

  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events`;
    const res = await axios.post(url, payload, {
      params: { access_token: accessToken },
      timeout: 8000,
    });
    logger.info("meta_capi_event_sent", {
      eventName,
      eventId,
      eventsReceived: res.data?.events_received ?? 1,
    });
  } catch (error) {
    const message =
      axios.isAxiosError(error)
        ? JSON.stringify(error.response?.data ?? error.message)
        : error instanceof Error
          ? error.message
          : String(error);
    logger.error("meta_capi_send_failed", { eventName, eventId, error: message });
  }
}
