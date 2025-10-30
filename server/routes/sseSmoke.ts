import { Router } from "express";

import { HEARTBEAT_INTERVAL_MS } from "./askEco/streaming";
import { createSSE } from "../utils/sse";

const router = Router();

const DEFAULT_HEARTBEAT_COUNT = 3;
const FINALIZE_DELAY_MS = 250;

function parseHeartbeatInterval(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

router.get("/api/_sse-smoke", (req, res) => {
  const sse = createSSE(res, req);
  sse.open();
  sse.sendComment("warmup");
  sse.send("control", { name: "prompt_ready", type: "prompt_ready" });

  const requestedInterval = parseHeartbeatInterval(req.query.heartbeat_ms);
  const heartbeatInterval = requestedInterval ?? HEARTBEAT_INTERVAL_MS;

  let heartbeatsSent = 0;
  let closed = false;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const finalizeStream = () => {
    if (closed) return;
    cleanup();
    sse.done({ ok: true, reason: "smoke_complete" });
    sse.end();
  };

  heartbeatTimer = setInterval(() => {
    if (closed) return;
    heartbeatsSent += 1;
    sse.sendComment("keep-alive");

    if (heartbeatsSent >= DEFAULT_HEARTBEAT_COUNT) {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      sse.chunk({ msg: "smoke:chunk-1" });
      setTimeout(finalizeStream, FINALIZE_DELAY_MS);
    }
  }, heartbeatInterval);

  res.on("close", cleanup);
  res.on("finish", cleanup);
});

export default router;
