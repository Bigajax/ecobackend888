import type { Request, Response } from "express";

export function prepareSseHeaders(res: Response) {
  if (!res.headersSent) {
    res.removeHeader("Content-Length");
    res.removeHeader("Content-Encoding");
  }
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
  _req?: Request,
  _opts?: AnyRecord
) {
  let opened = false;

  function open() {
    if (opened) return;
    opened = true;

    if (!res.headersSent) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      (res as any).flushHeaders?.();
    }

    res.write(`:ok\n\n`);
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
