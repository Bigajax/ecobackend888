import type { Request, Response } from "express";

export function sseHeaders(res: Response) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.removeHeader("Content-Length");
  res.removeHeader("Content-Encoding");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("X-No-Compression", "1");
  res.setHeader("Content-Encoding", "identity");
  res.flushHeaders?.();
}

function send(res: Response, event: string, data: unknown) {
  const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  res.write(line);
}

export default async function sseSmoke(_req: Request, res: Response) {
  try {
    sseHeaders(res);

    res.write("\n");

    send(res, "ready", { ok: true, ts: Date.now() });

    await new Promise((resolve) => setTimeout(resolve, 200));
    send(res, "chunk", { text: "hello " });

    await new Promise((resolve) => setTimeout(resolve, 200));
    send(res, "chunk", { text: "world" });

    await new Promise((resolve) => setTimeout(resolve, 100));
    send(res, "done", { reason: "smoke_ok" });

    setTimeout(() => {
      try {
        res.end();
      } catch (error) {
        console.error("[sseSmoke] Failed to close stream", error);
      }
    }, 10);
  } catch (error) {
    try {
      send(res, "error", { message: String(error) });
      res.end();
    } catch (closeError) {
      console.error("[sseSmoke] Failed to send error", closeError);
    }
  }
}
