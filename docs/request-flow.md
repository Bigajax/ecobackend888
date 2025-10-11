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
```

## Detailed flow description

1. **Client request.** A front end issues a `POST /api/memorias/registrar` request containing the memory payload and a `Bearer` token in the `Authorization` header.

