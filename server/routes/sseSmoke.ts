import { Router } from "express";

import { createSSE } from "../utils/sse";

const router = Router();

router.get("/api/_sse-smoke", (_req, res) => {
  const sse = createSSE(res);
  sse.open();
  sse.ready({ ok: true, source: "_sse-smoke" });
  sse.chunk({ msg: "smoke:chunk-1" });
  sse.done({ ok: true, reason: "smoke_complete" });
  sse.end();
});

export default router;
