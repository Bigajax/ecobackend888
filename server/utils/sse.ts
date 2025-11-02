import type { Request, Response } from "express";
import { randomUUID } from "crypto";

import { CORS_ALLOWED_HEADERS_VALUE, setCorsHeaders } from "../middleware/cors";

const SSE_HEADER_CONFIG = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

const SSE_EXPOSE_HEADERS = [
  "x-eco-guest-id",
  "x-eco-session-id",
  "x-eco-client-message-id",
] as const;

export function prepareSse(res: Response, origin?: string | null): void {
  const normalizedOrigin = typeof origin === "string" ? origin.trim() : "";

  if (!res.headersSent) {
    res.removeHeader("Content-Length");
    res.removeHeader("Content-Encoding");
  }

  const { headerOrigin } = setCorsHeaders(res, normalizedOrigin || null);
  const sseHeaders: Record<string, string> = {
    ...SSE_HEADER_CONFIG,
    "Access-Control-Expose-Headers": SSE_EXPOSE_HEADERS.join(", "),
    "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS_VALUE,
  };

  if (headerOrigin) {
    sseHeaders["Access-Control-Allow-Origin"] = headerOrigin;
  }

  if (!res.headersSent) {
    res.writeHead(200, sseHeaders);
  }

  (res as any).flushHeaders?.();
}

type AnyRecord = Record<string, unknown>;

function serializeData(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  try {
    return JSON.stringify(data ?? null);
  } catch {
    return JSON.stringify({ invalid: true });
  }
}

export function createSSE(
  res: Response,
  req?: Request,
  _opts?: AnyRecord
) {
  const interaction_id = randomUUID();
  let opened = false;
  let heartbeatInterval: NodeJS.Timeout | null = null;

  function open() {
    if (opened) return;
    opened = true;

    if (!res.headersSent) {
      const originHeader = typeof req?.headers.origin === "string" ? req.headers.origin : null;
      prepareSse(res, originHeader);
    }

    if (!(res as any).__ecoSseWarmupSent) {
      res.write(`:ok\n\n`);
      (res as any).__ecoSseWarmupSent = true;
    }

    heartbeatInterval = setInterval(() => {
      sendComment("heartbeat");
    }, 2000);
  }

  function ensureOpen() {
    if (!opened) {
      open();
    }
  }

  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  function end() {
    stopHeartbeat();
    if (!res.writableEnded) {
      res.end();
    }
  }

  function send(event: string, data: unknown) {
    ensureOpen();
    if (res.writableEnded) return;
    const payload = serializeData(data);
    const eventLine = `event: ${event}\n`;
    const dataLine = `data: ${payload}\n\n`;
    res.write(eventLine);
    res.write(dataLine);
    return Buffer.byteLength(eventLine) + Buffer.byteLength(dataLine);
  }

  function sendComment(comment: string) {
    ensureOpen();
    if (res.writableEnded) return;
    const chunk = `:${comment}\n\n`;
    res.write(chunk);
    return Buffer.byteLength(chunk);
  }

  function sendControl(name: string, payload?: Record<string, unknown>) {
    return send("control", payload ? { name, ...payload } : { name });
  }

  function write(data: unknown) {
    ensureOpen();
    if (res.writableEnded) return;
    const payload = serializeData(data);
    const chunk = `data: ${payload}\n\n`;
    res.write(chunk);
    return Buffer.byteLength(chunk);
  }

  return {
    open,
    prompt_ready: (data: { client_message_id: string })
      =>
      send("prompt_ready", { ...data, interaction_id }),
    chunk: (data: unknown) => {
      stopHeartbeat();
      return send("chunk", data);
    },
    done: (data: { ok: boolean; reason?: string; guardFallback?: boolean })
      => {
      const payload = {
        ...data,
        interaction_id,
        guardFallback: data.guardFallback ?? false,
      };
      return send("done", payload);
    },
    stream_done: (data: { ok: boolean; reason?: string; guardFallback?: boolean })
      => {
        const payload = {
          ...data,
          interaction_id,
          guardFallback: data.guardFallback ?? false,
        };
        return sendControl("stream_done", payload);
      },
    end,
    send,
    sendControl,
    sendComment,
    write,
    interaction_id,
  };
}

export type SSEConnection = ReturnType<typeof createSSE>;