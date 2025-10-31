import type { Request, Response } from "express";

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

  setCorsHeaders(res, normalizedOrigin || null);
  res.setHeader("Access-Control-Expose-Headers", SSE_EXPOSE_HEADERS.join(", "));
  res.setHeader("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS_VALUE);

  for (const [header, value] of Object.entries(SSE_HEADER_CONFIG)) {
    res.setHeader(header, value);
  }

  if (!res.headersSent) {
    res.status(200);
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
  let opened = false;

  function open() {
    if (opened) return;
    opened = true;

    if (!res.headersSent) {
      const originHeader = typeof req?.headers.origin === "string" ? req.headers.origin : null;
      prepareSse(res, originHeader);
    }

    if (!(res as any).__ecoSseWarmupSent) {
      res.write(`:\n\n`);
      (res as any).__ecoSseWarmupSent = true;
    }
  }

  function ensureOpen() {
    if (!opened) {
      open();
    }
  }

  function end() {
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
    ready: (data: unknown) => send("ready", data),
    chunk: (data: unknown) => send("chunk", data),
    done: (data: unknown) => send("done", data),
    end,
    send,
    sendControl,
    sendComment,
    write,
  };
}

export type SSEConnection = ReturnType<typeof createSSE>;
