import type { Request, Response } from "express";

import { applyCorsResponseHeaders } from "../middleware/cors";

export type IntervalRef = ReturnType<typeof setInterval>;
export type TimeoutRef = ReturnType<typeof setTimeout>;

export interface CreateSSEOptions {
  heartbeatMs?: number;
  idleMs?: number;
  onIdle?: () => void;
}

export interface SSEConnection {
  send: (event: string, data: unknown) => void;
  sendControl: (
    name: "prompt_ready" | "done" | string,
    meta?: Record<string, unknown>
  ) => void;
  end: () => void;
}

function isWritable(response: Response): boolean {
  const resAny = response as any;
  if (resAny.writableEnded || resAny.writableFinished) return false;
  if (resAny.destroyed) return false;
  return true;
}

export function createSSE(
  res: Response,
  req: Request,
  opts: CreateSSEOptions = {}
): SSEConnection {
  const { heartbeatMs = 15000, idleMs, onIdle } = opts;

  applyCorsResponseHeaders(req, res);
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  (res as any).flushHeaders?.();

  let ended = false;
  let heartbeatRef: IntervalRef | null = null;
  let idleRef: TimeoutRef | null = null;

  const clearHeartbeat = () => {
    if (heartbeatRef) {
      clearInterval(heartbeatRef);
      heartbeatRef = null;
    }
  };

  const clearIdle = () => {
    if (idleRef) {
      clearTimeout(idleRef);
      idleRef = null;
    }
  };

  const end = () => {
    if (ended) return;
    ended = true;
    clearHeartbeat();
    clearIdle();
    if (isWritable(res)) {
      res.end();
    }
  };

  const scheduleIdle = () => {
    if (!idleMs || idleMs <= 0) {
      return;
    }
    clearIdle();
    idleRef = setTimeout(() => {
      idleRef = null;
      if (ended) return;
      if (typeof onIdle === "function") {
        try {
          onIdle();
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn("SSE onIdle handler threw", error);
        }
      }
      end();
    }, idleMs);
  };

  const write = (chunk: string) => {
    if (ended) return;
    if (!isWritable(res)) {
      end();
      return;
    }
    try {
      res.write(chunk);
      (res as any).flush?.();
    } catch {
      end();
    }
  };

  const send = (event: string, data: unknown) => {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    write(`event: ${event}\ndata: ${payload}\n\n`);
    scheduleIdle();
  };

  const sendControl = (
    name: "prompt_ready" | "done" | string,
    data?: Record<string, unknown>
  ) => {
    const payload = { name, ...(data ?? {}) };
    send("control", payload);
  };

  if (heartbeatMs > 0) {
    heartbeatRef = setInterval(() => {
      write(`event: ping\ndata: ${Date.now()}\n\n`);
    }, heartbeatMs);
  }

  scheduleIdle();

  req.on("close", end);
  req.on("aborted", end);

  return {
    send,
    sendControl,
    end,
  };
}
