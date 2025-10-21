# ECO 1:1 Backend ↔ Frontend Pact

This document captures the canonical shapes for the ECO public endpoints that power the chat application. It is a plain-language reference for FE, BE, QA and support teams.

## Shared headers

All requests must send and all responses must echo the identity headers:

| Header | Direction | Notes |
| --- | --- | --- |
| `X-Eco-Guest-Id` | request + response | UUID v4 for anonymous users. Backend mirrors the UUID back, even when generated server-side. |
| `X-Eco-Session-Id` | request + response | Client-provided opaque string (<=256 chars). Generated server-side if missing and echoed back. |

Any change to these headers (name, casing, mirroring behaviour) is a breaking change.

## `/api/ask-eco` contract

### Streaming (SSE)

* **Request**: `POST /api/ask-eco` with `Accept: text/event-stream` and body:
  ```json
  {
    "stream": true,
    "messages": [ { "role": "user", "content": "Olá, ECO!" } ]
  }
  ```
* **Response headers**: echoes `X-Eco-Guest-Id`, `X-Eco-Session-Id`, and sets `Content-Type: text/event-stream`.
* **Event order**: the server emits events in this canonical order (optional events are marked `?`):

  1. `control` – `{ "name": "prompt_ready", "stream": true }`
  2. `meta?` – orchestrator metadata (`{ etapa, ... }`)
  3. `first_token` – `{ "delta": "…" }`
  4. `meta` – `{ "type": "first_token_latency_ms", "value": <number> }`
  5. `chunk` – `{ "delta": "…", "index": <number> }` (repeats for every fragment)
  6. `token` – `{ "text": "…" }` (legacy helper, can be ignored by FE)
  7. `memory_saved?` – `{ "memoriaId", "primeiraMemoriaSignificativa", "intensidade" }`
  8. `meta` – `{ "type": "llm_status", "chunks", "bytes", … }`
  9. `latency` – `{ "first_token_latency_ms", "total_latency_ms", "marks": { … } }`
  10. `done` – full summary payload (see below)
  11. `control` – `{ "name": "done", "summary": { … } }`

* **`done` payload schema**:
  ```json
  {
    "content": "string | null",
    "interaction_id": "uuid | null",
    "tokens": { "in": "number | null", "out": "number | null" },
    "meta": { "memory_events"?: [ { "memoriaId": "string", "intensidade": number } ], "…": "…" } | null,
    "timings": { "firstTokenLatencyMs"?: number, "totalLatencyMs"?: number, "llmStart"?: number, "llmEnd"?: number, "…": "…" } | null,
    "at": "ISO-8601 timestamp",
    "sinceStartMs": "number"
  }
  ```
  * `content` is the concatenated assistant output with sanitisation applied.
  * `meta.memory_events` lists every saved memory emitted during the stream.
  * `timings.marks` mirror upstream latency marks (`llmStart`, `llmEnd`, etc.).

### Non-streaming fallback

When the client passes `{"stream": false}` the server responds `200` with the exact same `done` JSON payload (no SSE envelope). This keeps FE reducers identical for streamed and non-streamed flows.

### Errors

* Structured errors follow `{ "code" | "message", … }` with HTTP status ≥400.
* The `control:done` event still fires with `summary.finish_reason` describing the failure (`error`, `timeout`, etc.).

## `/api/feedback`

* **Request**: `POST` with body `{ "interaction_id": "uuid", "vote": "up" | "down", "reason"?: "string", "source"?: "string" }`.
* **Success**: `204 No Content` (body empty). The request is idempotent.
* **Validation**: missing `interaction_id` or `vote` returns `400` with `{ "message", "status" }` JSON.

## `/api/signal`

* **Request**: `POST` with body `{ "signal": "view" | "first_token" | …, "interaction_id": "uuid", "meta"?: { … } }`.
* **Success**: `204 No Content`.
* **Persistence**: every accepted signal is stored in `analytics.eco_passive_signals` with non-null `meta`. The backend enriches metadata with `guest_id_header` and `session_id_header`.

## `/api/guest/claim`

* **Request**: `POST` with `Authorization: Bearer <user JWT>` and body `{ "guestId": "guest_<uuid>" }` (aliases like `guest-` or raw uuid are accepted).
* **Success**: `204 No Content`. Response echoes the same `X-Eco-*` headers received.
* **Failure**: missing/invalid bearer token → `401` JSON error.

## `/api/memorias/similares_v2`

* **Request**: `GET /api/memorias/similares_v2?usuario_id=<id>&texto=<query>&k=<1..5>&threshold=<0..1>`
* **Auth**: requires admin context (handled by backend). Old alias `/api/similares_v2` is **removed** and must return `404`.
* **Success**: `200` with `{ "success": true, "similares": [ { "id", "resumo_eco", "tags": [], "similarity": number, "distancia"?: number, "created_at"?: iso } ] }`.
* **Fallbacks**: missing `usuario_id` or empty `texto` yields `{ "success": true, "similares": [] }`.

## Breaking changes checklist

Before shipping any change touching these endpoints verify:

- [ ] SSE event names, order or payloads changed?
- [ ] `done` payload gained/removed keys or altered types?
- [ ] `X-Eco-*` headers still echoed by every endpoint?
- [ ] Feedback/Signal still return `204` on success?
- [ ] Guest claim still requires auth and responds `204`?
- [ ] Legacy `/api/similares_v2` remains blocked (404)?
- [ ] Postman collection updated?
- [ ] Contract tests (`npm run test:contract`) pass locally?

