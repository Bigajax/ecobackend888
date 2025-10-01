"use strict";
// core/ClaudeAdapter.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.claudeChatCompletion = claudeChatCompletion;
exports.streamClaudeChatCompletion = streamClaudeChatCompletion;
const node_stream_1 = require("node:stream");
const OpenRouterAdapter_1 = require("../adapters/OpenRouterAdapter");
const DEFAULT_TIMEOUT_MS = 12_000;
class ClaudeTimeoutError extends Error {
    constructor(timeoutMs) {
        super(`Claude request timed out after ${timeoutMs}ms`);
        this.name = "ClaudeTimeoutError";
    }
}
function resolveTimeoutMs() {
    const raw = Number(process.env.ECO_CLAUDE_TIMEOUT_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}
async function claudeChatCompletion({ messages, model = process.env.ECO_CLAUDE_MODEL || "anthropic/claude-sonnet-4", fallbackModel = process.env.ECO_CLAUDE_MODEL_FALLBACK || "anthropic/claude-3.7-sonnet", temperature = 0.5, maxTokens = 700, }) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY ausente no ambiente.");
    }
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const turns = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }));
    const headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.PUBLIC_APP_URL || "http://localhost:5173",
        "X-Title": "Eco App - ClaudeAdapter",
    };
    async function call(modelToUse) {
        const payload = {
            model: modelToUse,
            temperature,
            max_tokens: maxTokens,
            messages: [
                ...(system ? [{ role: "system", content: system }] : []),
                ...turns,
            ],
        };
        const timeoutMs = resolveTimeoutMs();
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal,
                agent: (parsedURL) => parsedURL.protocol === "http:" ? OpenRouterAdapter_1.httpAgent : OpenRouterAdapter_1.httpsAgent,
            });
            if (!resp.ok) {
                throw new Error(`OpenRouter error: ${resp.status} ${resp.statusText}`);
            }
            const data = (await resp.json());
            if (data.error?.message) {
                throw new Error(`OpenRouter API error: ${data.error.message}`);
            }
            const text = data.choices?.[0]?.message?.content ??
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
        }
        catch (err) {
            if (err?.name === "AbortError") {
                throw new ClaudeTimeoutError(timeoutMs);
            }
            throw err;
        }
        finally {
            clearTimeout(timeoutHandle);
        }
    }
    try {
        return await call(model);
    }
    catch (err) {
        const isTimeout = err instanceof ClaudeTimeoutError;
        const label = isTimeout ? "⏱️" : "⚠️";
        const message = isTimeout
            ? `Claude ${model} excedeu o tempo limite (${err.message}). Tentando fallback ${fallbackModel}`
            : `Claude ${model} falhou, tentando fallback ${fallbackModel}`;
        console.warn(`${label} ${message}`, err);
        return await call(fallbackModel);
    }
}
async function streamClaudeChatCompletion({ messages, model = process.env.ECO_CLAUDE_MODEL || "anthropic/claude-sonnet-4", temperature = 0.5, maxTokens = 700, }, callbacks) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY ausente no ambiente.");
    }
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const turns = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }));
    const headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.PUBLIC_APP_URL || "http://localhost:5173",
        "X-Title": "Eco App - ClaudeAdapter",
    };
    const payload = {
        model,
        temperature,
        max_tokens: maxTokens,
        stream: true,
        messages: [
            ...(system ? [{ role: "system", content: system }] : []),
            ...turns,
        ],
    };
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        agent: (parsedURL) => (parsedURL.protocol === "http:" ? OpenRouterAdapter_1.httpAgent : OpenRouterAdapter_1.httpsAgent),
    });
    if (!resp.ok) {
        throw new Error(`OpenRouter error: ${resp.status} ${resp.statusText}`);
    }
    const body = resp.body;
    if (!body) {
        throw new Error("OpenRouter streaming response sem corpo.");
    }
    const decoder = new TextDecoder();
    let buffer = "";
    let reconnectAttempt = 0;
    let doneEmitted = false;
    let latestUsage;
    let latestModel;
    let latestFinish;
    const handleEvent = async (rawEvent) => {
        const trimmed = rawEvent.trim();
        if (!trimmed)
            return;
        const lines = trimmed.split(/\r?\n/);
        let eventName = "message";
        const dataLines = [];
        for (const line of lines) {
            if (!line)
                continue;
            if (line.startsWith(":")) {
                // LATENCY: ignora heartbeats imediatos sem gerar carga.
                continue;
            }
            if (line.startsWith("event:")) {
                eventName = line.slice(6).trim();
                continue;
            }
            if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).trim());
            }
        }
        const dataPayload = dataLines.join("\n");
        if (!dataPayload)
            return;
        if (dataPayload === "[DONE]") {
            doneEmitted = true;
            await callbacks.onControl?.({
                type: "done",
                finishReason: latestFinish,
                usage: latestUsage,
                model: latestModel ?? model,
            });
            return;
        }
        let parsed = null;
        try {
            parsed = JSON.parse(dataPayload);
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            await callbacks.onError?.(err);
            return;
        }
        if (parsed?.error?.message) {
            const err = new Error(parsed.error.message);
            await callbacks.onError?.(err);
            return;
        }
        if (eventName && eventName.toLowerCase().includes("reconnect")) {
            reconnectAttempt += 1;
            await callbacks.onControl?.({ type: "reconnect", attempt: reconnectAttempt, raw: parsed });
            return;
        }
        if (parsed?.type === "heartbeat") {
            // LATENCY: heartbeat recebido — apenas mantém a conexão viva.
            return;
        }
        const choice = parsed?.choices?.[0];
        const deltaText = choice?.delta?.content ?? "";
        const finishReason = choice?.finish_reason ?? choice?.delta?.finish_reason ?? choice?.delta?.stop_reason ?? null;
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
            await callbacks.onChunk?.({ content: deltaText, raw: parsed });
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
    const reader = body.getReader?.();
    try {
        if (reader) {
            while (true) {
                const { value, done } = await reader.read();
                if (done)
                    break;
                if (value) {
                    // LATENCY: decodifica chunk SSE imediatamente.
                    buffer += decoder.decode(value, { stream: true });
                    await flushBuffer();
                }
            }
        }
        else {
            const nodeStream = typeof node_stream_1.Readable.fromWeb === "function"
                ? node_stream_1.Readable.fromWeb(body)
                : node_stream_1.Readable.from(body);
            for await (const chunk of nodeStream) {
                if (!chunk)
                    continue;
                // LATENCY: decodifica chunk SSE imediatamente (fallback Node stream).
                buffer += decoder.decode(chunk, { stream: true });
                await flushBuffer();
            }
        }
        buffer += decoder.decode(new Uint8Array(), { stream: false });
        await flushBuffer(true);
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        await callbacks.onError?.(err);
        throw err;
    }
    if (!doneEmitted) {
        await callbacks.onControl?.({
            type: "done",
            finishReason: latestFinish,
            usage: latestUsage,
            model: latestModel ?? model,
        });
    }
}
//# sourceMappingURL=ClaudeAdapter.js.map