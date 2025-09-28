// core/ClaudeAdapter.ts

import { httpAgent, httpsAgent } from "../adapters/OpenRouterAdapter";

type Msg = { role: "system" | "user" | "assistant"; content: string };

/** Tipos mínimos do retorno da OpenRouter (compatível com strict) */
type ORole = "system" | "user" | "assistant";
interface ORMessage { role: ORole; content?: string }
interface ORChoice { index?: number; message?: ORMessage; finish_reason?: string }
interface ORUsage { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
interface ORError { message?: string; type?: string }
interface ORChatCompletion {
  id?: string;
  model?: string;
  choices?: ORChoice[];
  usage?: ORUsage;
  error?: ORError;
  [k: string]: unknown;
}

const DEFAULT_TIMEOUT_MS = 12_000;

class ClaudeTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Claude request timed out after ${timeoutMs}ms`);
    this.name = "ClaudeTimeoutError";
  }
}

function resolveTimeoutMs() {
  const raw = Number(process.env.ECO_CLAUDE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

export async function claudeChatCompletion({
  messages,
  model = process.env.ECO_CLAUDE_MODEL || "anthropic/claude-sonnet-4",
  fallbackModel = process.env.ECO_CLAUDE_MODEL_FALLBACK || "anthropic/claude-3.7-sonnet",
  temperature = 0.5,
  maxTokens = 700,
}: {
  messages: Msg[];
  model?: string;
  fallbackModel?: string;
  temperature?: number;
  maxTokens?: number;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY ausente no ambiente.");
  }

  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const turns: ORMessage[] = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.PUBLIC_APP_URL || "http://localhost:5173",
    "X-Title": "Eco App - ClaudeAdapter",
  };

  async function call(modelToUse: string) {
    const payload = {
      model: modelToUse,
      temperature,
      max_tokens: maxTokens,
      messages: [
        ...(system ? [{ role: "system", content: system } as ORMessage] : []),
        ...turns,
      ],
    };

    const timeoutMs = resolveTimeoutMs();
    const controller = new AbortController();
    const timeoutHandle: NodeJS.Timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
        agent: (parsedURL: URL) =>
          parsedURL.protocol === "http:" ? httpAgent : httpsAgent,
      } as any);

      if (!resp.ok) {
        throw new Error(`OpenRouter error: ${resp.status} ${resp.statusText}`);
      }

      const data = (await resp.json()) as unknown as ORChatCompletion;

      if (data.error?.message) {
        throw new Error(`OpenRouter API error: ${data.error.message}`);
      }

      const text =
        data.choices?.[0]?.message?.content ??
        ""; // segura contra undefined

      return {
        content: text,
        model: data.model ?? modelToUse,
        usage: {
          total_tokens: data.usage?.total_tokens,
          prompt_tokens: data.usage?.prompt_tokens,
          completion_tokens: data.usage?.completion_tokens,
        },
        raw: data,
      };
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        throw new ClaudeTimeoutError(timeoutMs);
      }
      throw err;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  try {
    return await call(model);
  } catch (err) {
    const isTimeout = err instanceof ClaudeTimeoutError;
    const label = isTimeout ? "⏱️" : "⚠️";
    const message = isTimeout
      ? `Claude ${model} excedeu o tempo limite (${(err as Error).message}). Tentando fallback ${fallbackModel}`
      : `Claude ${model} falhou, tentando fallback ${fallbackModel}`;
    console.warn(`${label} ${message}`, err);
    return await call(fallbackModel!);
  }
}
