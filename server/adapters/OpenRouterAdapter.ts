import axios from "axios";
import http from "http";
import https from "https";

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

const MODEL_FALLBACK_MAIN = "openai/gpt-5-chat";

export async function callOpenRouterChat(
  payload: any,
  headers: Record<string, string>,
  timeoutMs = 12000
) {
  try {
    const resp = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      payload,
      { headers, timeout: timeoutMs, httpAgent, httpsAgent }
    );
    return resp.data;
  } catch (err: any) {
    const status = err?.response?.status;
    const body = err?.response?.data;
    const msg = body?.error?.message || body?.message || err?.message || "erro";
    const isTimeout = err?.code === "ECONNABORTED" || /timeout/i.test(msg);

    // 403 específico gpt-5 → gpt-5-chat
    if (status === 403 && payload?.model === "openai/gpt-5") {
      const retryPayload = { ...payload, model: MODEL_FALLBACK_MAIN };
      const retry = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        retryPayload,
        { headers, timeout: timeoutMs, httpAgent, httpsAgent }
      );
      return retry.data;
    }

    // timeout → mini
    const MODEL_TECH_ALT = process.env.ECO_MODEL_TECH_ALT || "openai/gpt-5-mini";
    if (isTimeout && payload?.model !== MODEL_TECH_ALT) {
      const retryPayload = {
        ...payload,
        model: MODEL_TECH_ALT,
        max_tokens: Math.min(220, Math.floor((payload?.max_tokens ?? 300) * 0.5)),
        temperature: Math.min(0.7, payload?.temperature ?? 0.7),
        top_p: 0.9,
      };
      const retry = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        retryPayload,
        { headers, timeout: Math.max(4000, Math.floor(timeoutMs * 0.6)), httpAgent, httpsAgent }
      );
      return retry.data;
    }

    throw new Error(`OpenRouter: ${status ?? "??"} - ${msg}`);
  }
}
