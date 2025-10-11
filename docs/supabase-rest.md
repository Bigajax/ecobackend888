# Supabase REST endpoints

This guide documents the REST interface that the project expects when talking directly
to Supabase tables. The goal is to avoid `404` responses caused by table slugs that do
not exist (for example `mensagens`) or by using the wrong HTTP method. All examples
assume the tables live in the public schema and that you already exported the standard
Supabase environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (or a service role key when bypassing Row Level Security)

When Row Level Security (RLS) is enabled you must include both the `apikey` header and
an `Authorization: Bearer <jwt>` header accepted by your policies.

> **Base URL**
>
> `https://<your-project>.supabase.co/rest/v1`

## Tables and routes

| Table      | REST path                | Notes |
|------------|-------------------------|-------|
| `mensagem` | `/rest/v1/mensagem`     | Singular name – **not** `mensagens`. |
| `memories` | `/rest/v1/memories`     | Plural name that matches the table. |

## Common operations

### List / filter

```http
GET /rest/v1/mensagem?select=* HTTP/1.1
Host: <project>.supabase.co
apikey: <anon-or-service-key>
Authorization: Bearer <jwt-if-rls-applies>
Accept: application/json
```

Add filters using the PostgREST syntax, for example
`?usuario_id=eq.<uuid>&data_hora=gte.2024-01-01`. A successful request returns HTTP
`200`.

### Insert new rows

```http
POST /rest/v1/mensagem HTTP/1.1
Host: <project>.supabase.co
Content-Type: application/json
Prefer: return=representation
apikey: <anon-or-service-key>
Authorization: Bearer <jwt-if-rls-applies>

{
  "usuario_id": "<uuid>",
  "conteudo": "Texto enviado pelo usuário",
  "data_hora": "2024-05-16T12:34:56.000Z",
  "sentimento": "positivo",
  "salvar_memoria": true
}
```

- Use `Prefer: return=representation` whenever the caller needs the inserted row.
- Expect `201 Created` (or `200 OK`) with the inserted record in the body.
- Ensure your RLS policies allow the insert for guests when required, otherwise use a
  service role key from the backend.

### Update existing rows

```http
PATCH /rest/v1/mensagem?id=eq.<uuid> HTTP/1.1
Host: <project>.supabase.co
Content-Type: application/json
apikey: <anon-or-service-key>
Authorization: Bearer <jwt-if-rls-applies>

{
  "sentimento": "neutro"
}
```

### Delete rows

```http
DELETE /rest/v1/mensagem?id=eq.<uuid> HTTP/1.1
Host: <project>.supabase.co
apikey: <anon-or-service-key>
Authorization: Bearer <jwt-if-rls-applies>
```

Apply the same patterns to the `memories` table, switching the path to
`/rest/v1/memories` and adjusting the payload to include the extra columns (for example
`embedding`, `embedding_emocional`, `nivel_abertura`, etc.).

## Handling errors

| Status | Meaning | Typical fix |
|--------|---------|-------------|
| `401` / `403` | Missing or disallowed credentials under RLS. | Supply `apikey` + valid JWT, or call from the backend with a service role key. |
| `404` | Route not found. | Double-check the slug – use `/rest/v1/mensagem` (singular) and `/rest/v1/memories` (plural). |
| `422` | Validation failure. | Check request payload types and required columns. |

## Acceptance checklist

- `GET /rest/v1/mensagem?select=*` responds with HTTP `200` in production.
- `POST /rest/v1/mensagem` creates a record and returns the representation when using
  `Prefer: return=representation`.
- Inserts into `memories` are only triggered when `salvar_memoria` is `true` or when the
  business rules explicitly require it.

Keep these conventions aligned with your Supabase policies whenever new columns or
flows are added so that mobile/web clients avoid regressions caused by mismatched
endpoints.
