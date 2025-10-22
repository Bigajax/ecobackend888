# ECO Backend — API & SSE Contract

## 1. Overview
- Server: Express deployed on Render.
- Browser access occurs via the **Vercel proxy** (`/api/*` → Render backend).
- Browser CORS restrictions are avoided via same-origin proxying, but we still respond with `204` to all `OPTIONS` requests for robustness.

## 2. Routes & Contracts
| Route (backend)      | Method | Description                                | SSE | Expected Status | Stream Close |
|----------------------|--------|--------------------------------------------|-----|-----------------|--------------|
| `/api/ask-eco`       | POST   | Primary conversation; token streaming      | ✅  | 200             | `event: done` + `data: ok` |
| `/api/mensagem`      | POST   | Message registration/synchronization       | ❌  | 200/204         | — |
| `/api/similares_v2`  | GET    | Retrieve semantically similar memories     | ❌  | 200             | — |
| `/api/feedback`      | POST   | Explicit feedback (like/dislike + reason)  | ❌  | 204             | — |
| `/api/signal`        | POST   | Passive analytics signals                  | ❌  | 204             | — |

## 3. Accepted Headers
- Common: `Content-Type: application/json`
- Identity headers:
  - `X-Eco-Guest-Id` (anonymous visitors)
  - `Authorization: Bearer <token>` (authenticated users)
  - `X-Eco-Client` (e.g., `web`)
- SSE (`/api/ask-eco`) responses **must include**:
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache`
  - `Connection: keep-alive`
  - Call `res.flushHeaders()` at stream start
  - Optional heartbeat: `:\n\n` every 20–30 seconds

## 4. SSE Contract (Required)
- Emit chunks via `data: <text>\n\n`.
- Standard termination:
  ```text
  event: done
  data: ok
  
  ```
  followed by `res.end()`.
- Alternate termination accepted by the frontend: `data: [DONE]` (legacy compatibility).

## 5. OPTIONS & Methods
- Provide a generic handler:
  - `OPTIONS /api/*` → respond `204` immediately.
- Allowed methods by route:
  - `/api/ask-eco`: **POST**
  - `/api/mensagem`: POST
  - `/api/similares_v2`: **GET**
  - `/api/feedback`: **POST**
  - `/api/signal`: **POST**

## 6. Response Codes
- Success:
  - Streaming endpoints: `200`
  - Lightweight CRUD: `200` or `204` as in the table
  - Feedback/Signal: `204`
- Errors:
  - `400` invalid payload
  - `401` missing/invalid auth where required
  - `404` avoid by ensuring paths match
  - `429` rate limiting
  - `5xx` internal failures

## 7. Logging & Diagnostics
- Log SSE start/end and whether `event: done` was emitted.
- Diagnostic endpoint (if available): `/api/diag/last?response_id=...` for HUD visibility.
- Include `interaction_id` in log entries.

## 8. Compliance Checklist
- [ ] All routes in Section 2 exist with the same names.
- [ ] `/api/ask-eco` sends `Content-Type: text/event-stream` and calls `flushHeaders()`.
- [ ] Stream terminates with `event: done` + `data: ok` + blank line.
- [ ] `OPTIONS /api/*` returns `204`.
- [ ] `/api/feedback` and `/api/signal` return `204`.
- [ ] Methods (GET vs POST) are correct.

## 9. SSE Trace Example
```text
:heartbeat

data: Olá!

data: Como posso ajudar?

event: done
data: ok

```
