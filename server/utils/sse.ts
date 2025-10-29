import type { Request, Response } from "express";

export interface PrepareSseHeadersOptions {
  flush?: boolean;
}

export function sendSse(res: Response, payload: unknown): number | null {
  const chunk = `data: ${JSON.stringify(payload)}\n\n`;
  try {
    res.write(chunk);
    return Buffer.byteLength(chunk);
  } catch (error) {
    console.error("[SSE write error]", error);
    return null;
  }
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
  const { flush = true } = options;

  ensureVaryIncludes(res, "Origin");

  res.removeHeader("Content-Length");
  res.removeHeader("Content-Encoding");
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("X-No-Compression", "1");
  res.setHeader("Content-Encoding", "identity");

  if (flush) {
    (res as any).flushHeaders?.();
  }
}

export type TimeoutRef = ReturnType<typeof setTimeout>;

export interface CreateSSEOptions {
  heartbeatMs?: number;
  pingIntervalMs?: number;
  idleMs?: number;
  onIdle?: () => void;
  onConnectionClose?: (info: { source: string; error?: unknown }) => void;
  commentOnOpen?: string | null;
}

export type SseControlName =
  | "prompt_ready"
  | "done"
  | "guard_fallback_trigger"
  | "error";

export interface SSEConnection {
  open: () => void;
  send: (event: string, data: unknown) => number | void;
  sendControl: (name: SseControlName, payload?: Record<string, unknown>) => number | void;
  sendComment: (comment: string) => void;
  write: (data: unknown) => number | void;
  end: () => void;
  ready: (data: unknown) => number | void;
  chunk: (data: unknown) => number | void;
  done: (data: unknown) => number | void;
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
  const {
    heartbeatMs,
    pingIntervalMs,
    idleMs,
    onIdle,
    onConnectionClose,
    commentOnOpen = "ok",
  } = opts;

  const resolvedPingMs = (() => {
    if (typeof pingIntervalMs === "number") return pingIntervalMs;
    if (typeof heartbeatMs === "number") return heartbeatMs;
    return 25000;
  })();

  const HEARTBEAT_INTERVAL_MS = 15000;

  let ended = false;
  let heartbeatRef: TimeoutRef | null = null;
  let idleRef: TimeoutRef | null = null;
  let opened = false;

  const open = () => {
    if (opened) {
      return;
    }
    opened = true;

    if (!res.headersSent) {
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      ensureVaryIncludes(res, "Origin");
      res.removeHeader("Content-Length");
      res.removeHeader("Content-Encoding");
      (res as any).flushHeaders?.();
    }

    if (commentOnOpen !== null) {
      try {
        res.write(`:${commentOnOpen ?? "ok"}\n\n`);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("[SSE] failed to write warm-up comment", error);
      }
    }
  };

  const ensureOpen = () => {
    if (!opened) {
      open();
    }
  };

  const clearHeartbeat = () => {
    if (heartbeatRef) {
      clearInterval(heartbeatRef as NodeJS.Timeout);
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
    if (ended || !idleMs || idleMs <= 0) {
      clearIdle();
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

  const handleClose = (source: string, error?: unknown) => {
    if (!ended) {
      onConnectionClose?.({ source, error });
      end();
      return;
    }
    onConnectionClose?.({ source, error });
  };

  const write = (chunk: string): boolean => {
    if (ended) return false;
    ensureOpen();
    if (!isWritable(res)) {
      end();
      return false;
    }
    try {
      res.write(chunk);
      (res as any).flushHeaders?.();
      (res as any).flush?.();
      return true;
    } catch (error) {
      handleClose("res.write", error);
      return false;
    }
  };

  const scheduleHeartbeat = () => {
    if (ended || resolvedPingMs <= 0) {
      clearHeartbeat();
      return;
    }
    clearHeartbeat();
    heartbeatRef = setInterval(() => {
      if (ended) {
        clearHeartbeat();
        return;
      }
      if (!write(`:ping\n\n`)) {
        return;
      }
      scheduleIdle();
    }, HEARTBEAT_INTERVAL_MS) as TimeoutRef;
  };

  const writePayload = (payload: unknown): number | void => {
    if (ended) return;
    ensureOpen();
    if (!isWritable(res)) {
      end();
      return;
    }
    const written = sendSse(res, payload);
    if (typeof written !== "number") {
      handleClose("res.write");
      return;
    }
    (res as any).flushHeaders?.();
    (res as any).flush?.();
    return written;
  };

  const normalizePayload = (
    event: string,
    data: unknown
  ): Record<string, unknown> => {
    const base: Record<string, unknown> =
      data && typeof data === "object" && !Array.isArray(data)
        ? { ...(data as Record<string, unknown>) }
        : {};

    if (!("type" in base) || typeof base.type !== "string" || !base.type) {
      base.type = event === "done" ? "end" : event;
    } else if (event === "done" && base.type === "done") {
      base.type = "end";
    }

    if (event === "chunk") {
      if (typeof base.content !== "string") {
        const delta = base.delta;
        if (typeof delta === "string") {
          base.content = delta;
        } else if (typeof data === "string") {
          base.content = data;
        }
      }
    }

    if (event === "done") {
      if (base.done !== true) {
        base.done = true;
      }
    }

    if (Object.keys(base).length === 0 && data !== undefined) {
      base.content = data as unknown;
    }

    return base;
  };

  const send = (event: string, data: unknown): number | void => {
    if (ended) return;
    const payload = normalizePayload(event, data);
    const written = writePayload(payload);
    if (typeof written !== "number") {
      return;
    }
    scheduleHeartbeat();
    scheduleIdle();
    return written;
  };

  const sendControl = (name: SseControlName, payload?: Record<string, unknown>) => {
    const data = payload && typeof payload === "object" ? { name, ...payload } : { name };
    return send("control", data);
  };

  const sendComment = (comment: string) => {
    if (ended) return;
    ensureOpen();
    const ok = write(`:${comment}\n\n`);
    if (!ok) {
      return;
    }
    scheduleIdle();
  };

  const writeData = (data: unknown): number | void => {
    if (ended) return;
    ensureOpen();
    const written = writePayload(data);
    if (typeof written !== "number") {
      return;
    }
    scheduleHeartbeat();
    scheduleIdle();
    return written;
  };

  if (resolvedPingMs > 0) {
    scheduleHeartbeat();
  }

  scheduleIdle();

  req.on("close", () => handleClose("req.close"));
  req.on("aborted", () => handleClose("req.aborted"));
  (res as any).on?.("close", () => handleClose("res.close"));
  (res as any).on?.("error", (error: unknown) => handleClose("res.error", error));

  return {
    open,
    send,
    sendControl,
    sendComment,
    write: writeData,
    end,
    ready: (data: unknown) => send("ready", data),
    chunk: (data: unknown) => send("chunk", data),
    done: (data: unknown) => send("done", data),
  };
}
