import type { Request, Response } from "express";

export interface PrepareSseHeadersOptions {
  origin?: string | null;
  allowCredentials?: boolean;
  flush?: boolean;
}

function ensureVaryIncludes(response: Response, value: string) {
  const existing = response.getHeader("Vary");
  if (!existing) {
    response.setHeader("Vary", value);
    return;
  }

  const normalized = (Array.isArray(existing) ? existing : [existing])
    .flatMap((entry) =>
      String(entry)
        .split(",")
        .map((piece) => piece.trim())
        .filter(Boolean)
    )
    .filter(Boolean);

  if (!normalized.includes(value)) {
    normalized.push(value);
    response.setHeader("Vary", normalized.join(", "));
  }
}

export function prepareSseHeaders(
  res: Response,
  options: PrepareSseHeadersOptions = {}
) {
  const { origin, allowCredentials = false, flush = true } = options;

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  ensureVaryIncludes(res, "Origin");

  res.setHeader(
    "Access-Control-Allow-Credentials",
    allowCredentials ? "true" : "false"
  );
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Transfer-Encoding", "chunked");

  if (flush) {
    (res as any).flushHeaders?.();
  }
}

export type IntervalRef = ReturnType<typeof setInterval>;
export type TimeoutRef = ReturnType<typeof setTimeout>;

export interface CreateSSEOptions {
  heartbeatMs?: number;
  idleMs?: number;
  onIdle?: () => void;
}

export type SseControlName = "prompt_ready" | "done";

export interface SSEConnection {
  send: (event: string, data: unknown) => void;
  sendControl: (name: SseControlName, payload?: Record<string, unknown>) => void;
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
  const { heartbeatMs = 25000, idleMs, onIdle } = opts;

  res.status(200);

  if (!res.hasHeader("Content-Type")) {
    res.setHeader("Content-Type", "text/event-stream");
  }
  if (!res.hasHeader("Cache-Control")) {
    res.setHeader("Cache-Control", "no-cache");
  }
  if (!res.hasHeader("Connection")) {
    res.setHeader("Connection", "keep-alive");
  }
  if (!res.hasHeader("X-Accel-Buffering")) {
    res.setHeader("X-Accel-Buffering", "no");
  }
  if (!res.hasHeader("Transfer-Encoding")) {
    res.setHeader("Transfer-Encoding", "chunked");
  }

  (res as any).flushHeaders?.();

  let ended = false;
  let heartbeatRef: TimeoutRef | null = null;
  let idleRef: TimeoutRef | null = null;

  const clearHeartbeat = () => {
    if (heartbeatRef) {
      clearTimeout(heartbeatRef);
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
    clearHeartbeat();
    clearIdle();
    const writable = isWritable(res);
    ended = true;
    if (writable && isWritable(res)) {
      try {
        res.end();
      } catch {
        // ignore errors closing the stream
      }
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

  const scheduleHeartbeat = () => {
    if (ended || heartbeatMs <= 0) {
      clearHeartbeat();
      return;
    }
    clearHeartbeat();
    heartbeatRef = setTimeout(() => {
      heartbeatRef = null;
      write(`:\n\n`);
      scheduleHeartbeat();
    }, heartbeatMs);
  };

  const send = (event: string, data: unknown) => {
    if (ended) return;
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    write(`event: ${event}\ndata: ${payload}\n\n`);
    scheduleHeartbeat();
    scheduleIdle();
  };

  const sendControl = (name: SseControlName, payload?: Record<string, unknown>) => {
    const data = payload && typeof payload === "object" ? { name, ...payload } : { name };
    send("control", data);
  };

  if (heartbeatMs > 0) {
    scheduleHeartbeat();
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
