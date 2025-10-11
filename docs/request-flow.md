# Memory Request Flow

This document traces the end-to-end flow for a client request that stores a memory via `POST /api/memorias/registrar`, covering the hop-by-hop responsibilities from the HTTP layer to the Supabase database.

## High-level sequence

```mermaid
sequenceDiagram
    participant Client
    participant Express as Express App
    participant PreRouter as App Middleware
    participant Router as Memory Router
    participant AdminMW as requireAdmin
    participant Controller as MemoryController
    participant Service as MemoryService
    participant Repository
    participant Supabase as Supabase Client
    participant Database as Supabase DB

    Client->>Express: POST /api/memorias/registrar (JSON + Bearer JWT)
    Express->>PreRouter: CORS, SSE headers, body parsers, logging, guest identity, rate limit
    PreRouter->>Router: Dispatch under /api/memorias
    Router->>AdminMW: requireAdmin attaches Supabase admin client
    AdminMW->>Controller: registerMemory(req, res)
    Controller->>Supabase: auth.getUser(jwt) using admin client
    Controller->>Service: registerMemory(userId, payload)
    Service->>Service: Prepare tags, embeddings, heuristics
    Service->>Repository: save(table, payload)
    Repository->>Supabase: save(table, payload)
    Supabase->>Database: Persist row and return data
    Database-->>Supabase: Inserted rows
    Supabase-->>Repository: data
    Repository-->>Service: data
    Service-->>Controller: { table, data }
    Controller-->>Client: HTTP 201 + JSON
```

## End-to-end request pipeline

```mermaid
flowchart TD
    A[Client Request<br/>POST /api/memorias/registrar] --> B[Express createApp]
    B --> C[CORS + OPTIONS handlers]
    C --> D[Logging + guest identity annotation]
    D --> E[Rate limiter (JWT ou guestId)]
    E --> F[Query normaliser]
    F --> G[Express Router /api/memorias]
    G --> H[requireAdmin middleware<br/>(injects Supabase admin client)]
    H --> I[MemoryController.registerMemory]
    I --> J[Supabase auth.getUser(jwt)]
    J --> K[MemoryService.registerMemory]
    K --> L[Generate tags, embeddings, heuristics]
    L --> M[MemoryRepository.save]
    M --> N[Supabase save()<br/>.select("*").single()]
    N --> O[(Supabase Database)]
    O --> |Inserted rows| N
    N --> M
    M --> L
    L --> K
    K --> I
    I --> |HTTP 201 + JSON| A
```

## Detailed flow description

1. **Client request.** A front end issues a `POST /api/memorias/registrar` request containing the memory payload and a `Bearer` token in the `Authorization` header.
2. **Express app bootstrap.** The Express application created in `createApp()` enables trust proxy, applies CORS early, handles universal `OPTIONS` pre-flights, registers SSE-friendly headers, attaches JSON/urlencoded parsers, logs every request, captures telemetry-only `X-Guest-Id` headers, enforces a light JWT/guest/IP rate limiter, hydrates the guest-session telemetry middleware, and normalises query parameters before mounting the memory routes under the `/api` prefix.【F:server/core/http/app.ts†L1-L156】
3. **Route dispatch with admin guard.** The memory router wraps all handlers with `requireAdmin`, ensuring every request receives the Supabase admin client on `req.admin`. If the environment variables are missing the middleware replies with `500` and `{ code: "SUPABASE_ADMIN_NOT_CONFIGURED" }` instead of reaching the controller.【F:server/domains/memory/routes.ts†L1-L16】【F:server/mw/requireAdmin.ts†L1-L24】
4. **Authentication.** The controller reads the injected `req.admin` client and calls `admin.auth.getUser(token)` to validate the provided bearer token. Missing configuration yields a `500` response while invalid or absent tokens trigger `401` with `{ code: "UNAUTHORIZED", message: "Missing or invalid token" }`, preventing guest identities from persisting memories.【F:server/domains/memory/controller.ts†L31-L90】
5. **Controller validation and delegation.** After parsing and validating the payload (ensuring `texto` and `intensidade` exist), the controller forwards the authenticated user id and request data to `MemoryService.registerMemory`. Business errors fall back to `{ code: "INTERNAL_ERROR" }` responses.【F:server/domains/memory/controller.ts†L92-L130】
6. **Service orchestration.** The `MemoryService` clamps the intensity, determines whether to persist in the permanent `memories` table or the temporary `referencias_temporarias` table, normalises tags (auto-generating them if empty), computes embeddings, estimates openness, and assembles the Supabase payload before delegating to the repository.【F:server/domains/memory/service.ts†L41-L118】
7. **Repository abstraction.** The domain repository defines the contract used by the service, guaranteeing that inserts resolve to a single typed row and lists honour user/tag filters capped at 100 items ordered by `created_at DESC`.【F:server/domains/memory/repository.ts†L1-L16】
8. **Supabase adapter and client.** The adapter uses the administrative Supabase client to insert the payload into the chosen table via `.select("*").single()`, normalises the returned row so it always exposes `id`, `texto`, `intensidade`, `tags`, `usuario_id`, and `created_at`, and enforces the list cap. The client itself is configured once using environment-provided URL and service role credentials, raising a `SupabaseConfigError` if they are missing.【F:server/adapters/supabaseMemoryRepository.ts†L1-L89】【F:server/lib/supabaseAdmin.ts†L1-L54】
9. **Response.** The controller forwards the service output directly, responding with `201 Created` and the `{ table, data }` payload that includes the Supabase-generated row id and timestamps.【F:server/domains/memory/controller.ts†L118-L130】



## Related retrieval flow (list)

For `GET /api/memorias`, the same middleware and router chain execute, but the controller calls `MemoryService.listMemories`, which leverages the repository's `list` method to query the `memories` table via Supabase with optional tag filtering and a maximum of 100 recent records before replying to the client.【F:server/domains/memory/controller.ts†L132-L174】【F:server/domains/memory/service.ts†L120-L143】【F:server/adapters/supabaseMemoryRepository.ts†L70-L89】

> ⚠️ **Security Notes**
>
> - The Supabase admin client bypasses RLS, so the controller always derives `usuario_id` from the validated JWT and ignores any identifier sent by the client body.【F:server/domains/memory/controller.ts†L66-L130】
> - The `X-Guest-Id` header is only used for telemetry and rate-limiting; it does **not** grant permission to write data.【F:server/core/http/app.ts†L169-L184】
