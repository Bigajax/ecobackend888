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
  res.removeHeader("Content-Length");
  res.removeHeader("Content-Encoding");
  res.setHeader("Content-Type", "text/event-stream");
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

export type SseControlName = "prompt_ready" | "done" | "guard_fallback_trigger";

export interface SSEConnection {
  send: (event: string, data: unknown) => number | void;
  sendControl: (name: SseControlName, payload?: Record<string, unknown>) => number | void;
  sendComment: (comment: string) => void;
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

  res.status(200);

  if (!res.hasHeader("Content-Type")) {
    res.setHeader("Content-Type", "text/event-stream");
  }
  if (!res.hasHeader("Cache-Control")) {
    res.setHeader("Cache-Control", "no-cache, no-transform");
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
  if (res.hasHeader("Content-Length")) {
    res.removeHeader("Content-Length");
  }
  if (res.hasHeader("Content-Encoding")) {
    res.removeHeader("Content-Encoding");
  }
  res.setHeader("Content-Encoding", "identity");
  res.setHeader("X-No-Compression", "1");

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

  const write = (chunk: string): boolean => {
    if (ended) return false;
    if (!isWritable(res)) {
      end();
      return false;
    }
    try {
      res.write(chunk);
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
    heartbeatRef = setTimeout(() => {
      heartbeatRef = null;
      const timestamp = new Date().toISOString();
      if (!write(`event: ping\ndata: ${timestamp}\n\n`)) {
        return;
      }
      scheduleIdle();
      scheduleHeartbeat();
    }, resolvedPingMs);
  };

  const send = (event: string, data: unknown): number | void => {
    if (ended) return;
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    const chunk = `event: ${event}\ndata: ${payload}\n\n`;
    const ok = write(chunk);
    if (!ok) {
      return;
    }
    scheduleHeartbeat();
    scheduleIdle();
    return Buffer.byteLength(chunk);
  };

  const sendControl = (name: SseControlName, payload?: Record<string, unknown>) => {
    const data = payload && typeof payload === "object" ? { name, ...payload } : { name };
    return send("control", data);
  };

  const sendComment = (comment: string) => {
    if (ended) return;
    const ok = write(`:${comment}\n\n`);
    if (!ok) {
      return;
    }
    scheduleIdle();
  };

  if (resolvedPingMs > 0) {
    scheduleHeartbeat();
  }

  scheduleIdle();

  if (commentOnOpen) {
    sendComment(commentOnOpen);
  }

  const handleClose = (source: string, error?: unknown) => {
    if (!ended) {
      onConnectionClose?.({ source, error });
      end();
      return;
    }
    onConnectionClose?.({ source, error });
  };

  req.on("close", () => handleClose("req.close"));
  req.on("aborted", () => handleClose("req.aborted"));
  (res as any).on?.("close", () => handleClose("res.close"));
  (res as any).on?.("error", (error: unknown) => handleClose("res.error", error));

  return {
    send,
    sendControl,
    sendComment,
    end,
  };
}
