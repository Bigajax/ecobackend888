// core/ClaudeAdapter.ts

import { Readable } from "node:stream";

import { httpAgent, httpsAgent } from "../adapters/OpenRouterAdapter";
import { log } from "../services/promptContext/logger";

export type Msg = { role: "system" | "user" | "assistant"; content: string; name?: string };

/** Tipos mínimos do retorno da OpenRouter (compatível com strict) */
type ORole = "system" | "user" | "assistant";
type ORContentPiece =
  | string
  | {
      type?: string;
      text?: string;
      content?: ORContentPiece | ORContentPiece[];
      value?: string;
    };

interface ORMessage { role: ORole; content?: string | ORContentPiece[] }
interface ORChoice { index?: number; message?: ORMessage; finish_reason?: string }
export interface ORUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}
interface ORError { message?: string; type?: string }
interface ORChatCompletion {
  id?: string;
  model?: string;
  choices?: ORChoice[];
  usage?: ORUsage;
  error?: ORError;
  [k: string]: unknown;
}

interface ORDeltaChoice {
  index?: number;
  delta?: {
    content?: ORContentPiece | ORContentPiece[] | string;
    text?: string;
    role?: ORole;
    stop_reason?: string;
    finish_reason?: string;
  };
  finish_reason?: string | null;
}

interface ORStreamChunk {
  id?: string;
  model?: string;
  choices?: ORDeltaChoice[];
  usage?: ORUsage;
  error?: ORError;
  [k: string]: unknown;
}

export type ClaudeStreamControlEvent =
  | { type: "reconnect"; attempt: number; raw?: unknown }
  | { type: "done"; finishReason?: string | null; usage?: ORUsage; model?: string | null };

export interface ClaudeStreamCallbacks {
  onChunk?: (chunk: { content: string; raw: ORStreamChunk }) => void | Promise<void>;
  onControl?: (event: ClaudeStreamControlEvent) => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
  onFallback?: (model: string) => void | Promise<void>;
}

export interface ClaudeStreamOptions {
  signal?: AbortSignal;
  externalSignal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 30_000; // fix: extend LLM timeout to avoid premature stream aborts

class ClaudeTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Claude request timed out after ${timeoutMs}ms`);
    this.name = "ClaudeTimeoutError";
    (this as any).__claudeBeforeStream = true;
    (this as any).__claudeStreamDelivered = false;
  }
}

function resolveTimeoutMs() {
  const raw = Number(process.env.ECO_CLAUDE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

function flattenContentPieces(input: unknown): string[] {
  if (!input) {
    return [];
  }

  if (typeof input === "string") {
    return [input];
  }

  if (Array.isArray(input)) {
    return input.flatMap((entry) => flattenContentPieces(entry));
  }

  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const pieces: string[] = [];

    if (typeof obj.text === "string") {
      pieces.push(obj.text);
    }

    if (typeof obj.value === "string") {
      pieces.push(obj.value);
    }

    if (typeof obj.content === "string") {
      pieces.push(obj.content);
    } else if (Array.isArray(obj.content)) {
      pieces.push(...flattenContentPieces(obj.content));
    }

    return pieces;
  }

  return [];
}

function normalizeOpenRouterText(input: unknown): string {
  const pieces = flattenContentPieces(input);
  return pieces.length ? pieces.join("") : "";
}

function extractDeltaText(delta: ORDeltaChoice["delta"] | undefined): string {
  if (!delta) {
    return "";
  }

  if (typeof delta.text === "string" && delta.text) {
    return delta.text;
  }

  return normalizeOpenRouterText(delta.content);
}

export async function claudeChatCompletion({
  messages,
  model = process.env.ECO_CLAUDE_MODEL || "anthropic/claude-3.7-sonnet",
  fallbackModel = process.env.ECO_CLAUDE_MODEL_FALLBACK || "anthropic/claude-sonnet-4",
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

  const systemMessages = messages.filter((m) => m.role === "system");
  const system = systemMessages.map((m) => m.content).join("\n\n");
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
    const timeoutReason = new ClaudeTimeoutError(timeoutMs);
    const timeoutHandle: NodeJS.Timeout = setTimeout(
      () => controller.abort(timeoutReason),
      timeoutMs
    );

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

      const primaryChoice = data.choices?.[0];
      const text =
        normalizeOpenRouterText(primaryChoice?.message?.content) ||
        normalizeOpenRouterText((primaryChoice as any)?.message) ||
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
        throw resolveAbortError(timeoutReason, controller.signal);
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

export async function streamClaudeChatCompletion(
  {
    messages,
    model = process.env.ECO_CLAUDE_MODEL || "anthropic/claude-3.7-sonnet",
    fallbackModel = process.env.ECO_CLAUDE_MODEL_FALLBACK || "anthropic/claude-sonnet-4",
    temperature = 0.5,
    maxTokens = 700,
  }: {
    messages: Msg[];
    model?: string;
    fallbackModel?: string;
    temperature?: number;
    maxTokens?: number;
  },
  callbacks: ClaudeStreamCallbacks,
  options: ClaudeStreamOptions = {}
): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY ausente no ambiente.");
  }

  const systemMessages = messages.filter((m) => m.role === "system");
  const system = systemMessages.map((m) => m.content).join("\n\n");
  const turns: ORMessage[] = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "HTTP-Referer": process.env.PUBLIC_APP_URL || "http://localhost:5173",
    "X-Title": "Eco App - ClaudeAdapter",
  };

  const externalSignal = options.externalSignal ?? options.signal;

  const attemptStream = async (modelToUse: string, emitErrorEvents: boolean): Promise<void> => {
    const payload = {
      model: modelToUse,
      temperature,
      max_tokens: maxTokens,
      stream: true,
      messages: [
        ...(system ? [{ role: "system", content: system } as ORMessage] : []),
        ...turns,
      ],
    };

    const timeoutMs = resolveTimeoutMs();
    const controller = new AbortController();
    const timeoutReason = new ClaudeTimeoutError(timeoutMs);
    const timeoutHandle: NodeJS.Timeout = setTimeout(
      () => controller.abort(timeoutReason),
      timeoutMs
    );
    const linked = linkAbortSignals(controller.signal, externalSignal);
    const requestSignal: AbortSignal = linked.signal ?? controller.signal;

    log.debug("[provider_request]", { stream: payload.stream, model: payload.model });

    try {
      const request = async () =>
        fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: requestSignal,
          agent: (parsedURL: URL) => (parsedURL.protocol === "http:" ? httpAgent : httpsAgent),
        } as any);

      let resp: Awaited<ReturnType<typeof fetch>>;
      try {
        resp = await request();
        log.debug("[provider_response]", { contentType: resp.headers.get("content-type") });

        const isSse = /^text\/event-stream/i.test(resp.headers.get("content-type") || "");
        if (!isSse) {
          const json = await resp.json().catch(() => null);
          const text =
            json?.choices?.[0]?.message?.content ||
            (json?.content?.[0] && json?.content?.[0].text) ||
            "";

          log.warn("[non_sse_fallback]", { used: !!text, contentLength: text?.length || 0 });

          if (text) {
            await callbacks.onChunk?.({ content: text, raw: json });
            await callbacks.onControl?.({ type: "done", finishReason: "fallback" });
            return;
          } else {
            throw new Error("NON_SSE_EMPTY");
          }
        }
      } catch (error) {
        if ((error as Error)?.name === "AbortError") {
          const abortError = resolveAbortError(timeoutReason, requestSignal, controller.signal, externalSignal);
          throw abortError;
        }
        throw error;
      }

      if (!resp.ok) {
        const err = new Error(`OpenRouter error: ${resp.status} ${resp.statusText}`);
        (err as any).__claudeBeforeStream = true;
        (err as any).__claudeStreamDelivered = false;
        throw err;
      }

      const body = resp.body as ReadableStream<Uint8Array> | null;
      if (!body) {
        const err = new Error("OpenRouter streaming response sem corpo.");
        (err as any).__claudeBeforeStream = true;
        (err as any).__claudeStreamDelivered = false;
        throw err;
      }

      const decoder = new TextDecoder("utf-8", { fatal: false });
      let buffer = "";
      let reconnectAttempt = 0;
      let doneEmitted = false;
      let latestUsage: ORUsage | undefined;
      let latestModel: string | null | undefined;
      let latestFinish: string | null | undefined;
      let deliveredAnyEvents = false;

      const safeCallbacks: ClaudeStreamCallbacks = {
        onChunk: async (chunk) => {
          deliveredAnyEvents = true;
          await callbacks.onChunk?.(chunk);
        },
        onControl: async (event) => {
          if (event.type !== "reconnect") {
            deliveredAnyEvents = true;
          }
          await callbacks.onControl?.(event);
        },
        onError: async (error) => {
          const hadDelivered = deliveredAnyEvents;
          deliveredAnyEvents = true;
          if (emitErrorEvents || hadDelivered) {
            await callbacks.onError?.(error);
          }
        },
      };

      const handleEvent = async (rawEvent: string) => {
        const trimmed = rawEvent.trim();
        if (!trimmed) return;

        const lines = trimmed.split(/\r?\n/);
        let eventName = "message";
      const dataLines: string[] = [];

      for (const line of lines) {
        if (!line) continue;
        if (line.startsWith(":")) {
          // LATENCY: ignora heartbeats imediatos sem gerar carga.
          continue;
        }
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
          continue;
        }
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5));
        }
      }

      const dataPayload = dataLines.join("\n");
      const trimmedData = dataPayload.trim();

      if (!trimmedData) return;

      if (trimmedData === "[DONE]") {
        console.debug("[ClaudeAdapter] Stream completed ([DONE] received)");
        doneEmitted = true;
        await safeCallbacks.onControl?.({
          type: "done",
          finishReason: latestFinish,
          usage: latestUsage,
          model: latestModel ?? modelToUse,
        });
        return;
      }

      if (!trimmedData.startsWith("{")) {
        console.warn("[ClaudeAdapter] Ignoring non-JSON line:", dataPayload);
        return;
      }

      let parsed: ORStreamChunk | null = null;
      try {
        parsed = JSON.parse(trimmedData) as ORStreamChunk;
      } catch (error) {
        console.warn("[ClaudeAdapter] Ignoring non-JSON line:", dataPayload);
        return;
      }

      if (parsed?.error?.message) {
        const err = new Error(parsed.error.message);
        await safeCallbacks.onError?.(err);
        return;
      }

      if (eventName && eventName.toLowerCase().includes("reconnect")) {
        reconnectAttempt += 1;
        await safeCallbacks.onControl?.({ type: "reconnect", attempt: reconnectAttempt, raw: parsed });
        return;
      }

      if ((parsed as any)?.type === "heartbeat") {
        // LATENCY: heartbeat recebido — apenas mantém a conexão viva.
        return;
      }

      const choice = parsed?.choices?.[0];
      const deltaText = extractDeltaText(choice?.delta);
      const finishReason =
        choice?.finish_reason ?? choice?.delta?.finish_reason ?? choice?.delta?.stop_reason ?? null;

      if (parsed?.usage) {
        latestUsage = parsed.usage;
      }
      if (parsed?.model) {
        latestModel = parsed.model;
      }
      if (finishReason) {
        latestFinish = finishReason;
      }

      if (deltaText) {
        // LATENCY: entrega incremental do token renderizável.
        await safeCallbacks.onChunk?.({ content: deltaText, raw: parsed });
      }
    };

      const flushBuffer = async (force = false) => {
        let separatorIndex = buffer.indexOf("\n\n");
        while (separatorIndex >= 0) {
          const rawEvent = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          await handleEvent(rawEvent);
          separatorIndex = buffer.indexOf("\n\n");
        }

        if (force && buffer.trim()) {
          await handleEvent(buffer);
          buffer = "";
        }
      };

      const reader = (body as any).getReader?.() as
        | ReadableStreamDefaultReader<Uint8Array>
        | undefined;

      try {
        if (reader) {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              // LATENCY: decodifica chunk SSE imediatamente.
              buffer += decoder.decode(value, { stream: true });
              await flushBuffer();
            }
          }
        } else {
          const nodeStream =
            typeof Readable.fromWeb === "function"
              ? Readable.fromWeb(body as any)
              : Readable.from(body as any);
          for await (const chunk of nodeStream) {
            if (!chunk) continue;
            // LATENCY: decodifica chunk SSE imediatamente (fallback Node stream).
            buffer += decoder.decode(chunk as Buffer, { stream: true });
            await flushBuffer();
          }
        }

        buffer += decoder.decode(new Uint8Array(), { stream: false });
        await flushBuffer(true);
      } catch (error) {
        if ((error as Error)?.name === "AbortError") {
          const abortError = resolveAbortError(timeoutReason, requestSignal, controller.signal, externalSignal);
          throw abortError;
        }
        const err = error instanceof Error ? error : new Error(String(error));
        if (emitErrorEvents || deliveredAnyEvents) {
          await callbacks.onError?.(err);
        }
        (err as any).__claudeStreamDelivered = deliveredAnyEvents;
        throw err;
      }

      if (!doneEmitted) {
        await safeCallbacks.onControl?.({
          type: "done",
          finishReason: latestFinish,
          usage: latestUsage,
          model: latestModel ?? modelToUse,
        });
      }
    } finally {
      linked.teardown?.();
      clearTimeout(timeoutHandle);
    }
  };

  const modelsToTry = [model];
  if (fallbackModel && fallbackModel !== model) {
    modelsToTry.push(fallbackModel);
  }

  let lastError: Error | null = null;
  for (let i = 0; i < modelsToTry.length; i += 1) {
    const currentModel = modelsToTry[i]!;
    const isFinalAttempt = i === modelsToTry.length - 1;
    try {
      await attemptStream(currentModel, isFinalAttempt);
      return;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;
      const delivered = (err as any).__claudeStreamDelivered === true;
      if (isFinalAttempt || delivered) {
        throw err;
      }
      const isTimeout = err instanceof ClaudeTimeoutError;
      const label = isTimeout ? "⏱️" : "⚠️";
      callbacks.onFallback?.(modelsToTry[i + 1]!);
      console.warn(
        `${label} Claude ${currentModel} falhou, tentando fallback ${modelsToTry[i + 1]}`,
        err
      );
    }
  }

  if (lastError) {
    throw lastError;
  }
}

function resolveAbortError(
  timeoutReason: Error,
  ...signals: (AbortSignal | undefined)[]
): Error {
  for (const signal of signals) {
    if (!signal) continue;
    const reason = (signal as any).reason;
    if (reason instanceof Error) {
      return reason;
    }
    if (typeof reason === "string" && reason.trim()) {
      const err = new Error(reason.trim());
      err.name = "AbortError";
      return err;
    }
    if (reason !== undefined) {
      const err = new Error(String(reason));
      err.name = "AbortError";
      return err;
    }
  }
  return timeoutReason;
}

function linkAbortSignals(
  ...maybeSignals: (AbortSignal | undefined)[]
): { signal: AbortSignal | undefined; teardown?: () => void } {
  const signals = maybeSignals.filter(Boolean) as AbortSignal[];
  if (signals.length === 0) {
    return { signal: undefined, teardown: undefined };
  }

  const anyFn = (AbortSignal as any).any;
  if (typeof anyFn === "function") {
    return { signal: anyFn(signals), teardown: undefined };
  }

  const controller = new AbortController();
  const listeners = signals.map((signal) => {
    const handler = () => {
      const reason = (signal as any).reason;
      if (reason !== undefined) {
        controller.abort(reason);
      } else {
        controller.abort();
      }
    };
    signal.addEventListener("abort", handler, { once: true });
    return { signal, handler } as const;
  });

  return {
    signal: controller.signal,
    teardown: () => {
      for (const { signal, handler } of listeners) {
        signal.removeEventListener("abort", handler);
      }
    },
  };
}
