# Contrato ECO — Mapa 1-a-1 Front ↔ Back

## Seção 1 — Identidade (UUID v4)

| Nome Front       | Onde enviar   | Nome exato              | Obrigatório | Exemplo                                 |
| ---------------- | ------------- | ----------------------- | ----------- | --------------------------------------- |
| guestId          | Query (SSE)   | guest_id                | Sim         | 00000000-0000-4000-8000-000000000001    |
| sessionId        | Query (SSE)   | session_id              | Sim         | 00000000-0000-4000-8000-000000000002    |
| clientMessageId  | Query (SSE)   | client_message_id       | Opcional    | cmsg-123                                |
| guestId          | Header (JSON) | X-Eco-Guest-Id          | Sim         | 00000000-0000-4000-8000-000000000001    |
| sessionId        | Header (JSON) | X-Eco-Session-Id        | Sim         | 00000000-0000-4000-8000-000000000002    |
| clientMessageId  | Header (JSON) | X-Eco-Client-Message-Id | Opcional    | cmsg-123                                |

Regex UUID v4:

```
^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
```

## Seção 2 — SSE (GET /api/ask-eco)

- Método: `GET`
- Query obrigatória:
  - `guest_id` (UUID v4)
  - `session_id` (UUID v4)
  - `message` ou `texto` (STRING - a mensagem do usuário) ⚠️ **OBRIGATÓRIO**
- Query opcional:
  - `client_message_id` (para deduplicação)
  - `messages` (JSON array de {role, content})
  - `payload` (JSON completo com todas as propriedades)
- Eventos emitidos: `ready` → múltiplos `chunk` → `done`
- Headers enviados pelo servidor na abertura:
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache, no-transform`
  - `Connection: keep-alive`
  - `Access-Control-Allow-Origin: <echoed origin>`
- Se `guest_id` ou `session_id` não forem UUID v4 válidos, o backend encerra com `400 invalid_guest_id`.
- Se nenhuma mensagem for enviada (falta `message`, `texto`, ou `messages`), retorna `400`.

## Seção 3 — Fallback JSON (POST /api/ask-eco)

- Método: `POST`
- Headers obrigatórios: `X-Eco-Guest-Id`, `X-Eco-Session-Id` (`X-Eco-Client-Message-Id` opcional)
- Body exemplo:

```json
{"message":"oi","history":[]}
```

- Resposta exemplo:

```json
{"text":"..."}
```

## Seção 4 — CORS

- Allowlist de origens/padrões:
  - https://ecofrontend888.vercel.app
  - https://ecofrontend888-*.vercel.app
  - http://localhost:5173
  - http://localhost:4173
- `Vary: Origin` habilitado
- Métodos permitidos: `GET`, `POST`, `OPTIONS`, `HEAD`
- Headers permitidos (case-insensitive):
  - `content-type`
  - `accept`
  - `x-eco-client-message-id` (opcional, para deduplicação)
  - `x-eco-guest-id` (identidade anônima)
  - `x-eco-session-id` (sessão)
  - `x-client-id` (alternativo para guest-id)
  - `authorization` (JWT para usuários autenticados)

## Seção 5 — Códigos & Timeouts

- Códigos de erro:
- `400 invalid_guest_id` — "Envie um UUID v4 em X-Eco-Guest-Id"
- `400 missing_guest_id` — "Informe X-Eco-Guest-Id"
- `400 missing_session_id` — "Informe X-Eco-Session-Id"
- Timeouts (ms):
  - Supabase: `8000`
  - OpenRouter: `30000`
  - Node `keepAliveTimeout`: `70000`
  - Node `headersTimeout`: `75000`

## Seção 6 — Snippets Front prontos

### SSE (Correct)

```ts
const u = new URL(`${BACKEND}/api/ask-eco`);
u.searchParams.set('guest_id', guestId);
u.searchParams.set('session_id', sessionId);
u.searchParams.set('message', userMessage);  // ⚠️ OBRIGATÓRIO
u.searchParams.set('client_message_id', clientMessageId);
// Opcional: adicionar headers se usar EventSource com credenciais
const es = new EventSource(u.toString(), { withCredentials: true });

// Listeners
es.addEventListener('chunk', (evt) => {
  const data = JSON.parse(evt.data);
  console.log('received:', data.text);
});

es.addEventListener('done', (evt) => {
  const data = JSON.parse(evt.data);
  console.log('finished:', data.meta);
  es.close();
});
```

### JSON

```ts
fetch(`${BACKEND}/api/ask-eco`, {
  method: 'POST',
  headers: {
    'Content-Type':'application/json',
    'X-Eco-Guest-Id': guestId,
    'X-Eco-Session-Id': sessionId,
    'X-Eco-Client-Message-Id': clientMessageId
  },
  body: JSON.stringify({ message, history })
});
```
