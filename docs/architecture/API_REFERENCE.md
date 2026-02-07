# Referência de API
Todas as rotas vivem sob o servidor Express configurado em `server/core/http/app.ts`. As requisições devem enviar `X-Eco-Guest-Id` e `X-Eco-Session-Id` com UUID v4 válidos quando não autenticadas; o middleware rejeita requisições sem esses cabeçalhos (ou equivalentes via query/body).【F:server/middleware/ensureIdentity.ts†L31-L99】

## Saúde e introspecção
### `GET /`
Retorna `200 OK` com corpo `OK` para sondagens simples.【F:server/core/http/app.ts†L170-L175】

### `GET /health`
Responde `200 OK` com texto `ok` e `Content-Type: text/plain` para probes legados.【F:server/core/http/app.ts†L170-L178】

### `GET /healthz`
Retorna JSON `{ status: "ok", timestamp: ISO }` para liveness checks.【F:server/core/http/app.ts†L170-L178】

### `GET /readyz`
Retorna `200 {"status":"ready"}` apenas se o cliente Supabase admin estiver configurado; caso contrário responde `503 {"status":"degraded","reason":"no-admin-config"}`.【F:server/core/http/app.ts†L209-L214】 Exemplo:
```bash
curl -s http://localhost:3001/readyz | jq
```

### `GET /api/health`
Inclui estado dos módulos e do prompt base (`ready`, `loading`, `error`). Erros retornam `503` com detalhes e raízes monitoradas.【F:server/core/http/app.ts†L179-L208】

### `GET /api/_eco-contract`
Retorna contrato JSON com versão, CORS, identidade e timeouts oficiais do `/api/ask-eco` (SSE e fallback JSON).【F:server/core/http/app.ts†L215-L314】 Use para auto-configuração de SDKs.

## Conversa (`/api/ask-eco`)
### `GET /api/ask-eco`
- **Uso**: preferido para streaming SSE (`Accept: text/event-stream`).
- **Identidade**: `guest_id`, `session_id` e `client_message_id` aceitos por query (`?guest_id=<uuid>&session_id=<uuid>`), body (`payload`) ou headers `X-Eco-*`. Valores são normalizados e validados como UUID v4.【F:server/routes/promptRoutes.ts†L592-L734】【F:server/middleware/ensureIdentity.ts†L45-L99】
- **Resposta**: conexão `text/event-stream` com cabeçalhos `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`. Um heartbeat `:ok` é enviado na abertura e heartbeats `:heartbeat` a cada 2s.【F:server/utils/sse.ts†L6-L70】【F:server/utils/sse.ts†L86-L111】
- **Eventos**: `meta`, `chunk`, `memory_saved`, `done`, `error`, além de `control` (`prompt_ready`, `done`, `guard_fallback_trigger`). Payloads incluem `streamId`, índices de chunk, tokens e uso agregado.【F:server/sse/sseEvents.ts†L133-L318】【F:server/services/conversation/types.ts†L11-L70】
- **Erros**: inputs inválidos geram evento `error` seguido de `done` com `ok:false`. Origem bloqueada retorna `403` antes de abrir o stream.【F:server/routes/promptRoutes.ts†L700-L847】

Exemplo (stream abre e fecha automaticamente após 5 segundos usando `curl` 7.81+):
```bash
curl -N -G \
  -H "Accept: text/event-stream" \
  --data-urlencode "guest_id=<uuid-v4>" \
  --data-urlencode "session_id=<uuid-v4>" \
  --data-urlencode "texto=Oi, Eco!" \
  http://localhost:3001/api/ask-eco
```

### `POST /api/ask-eco`
Fallback JSON quando o cliente não suporta SSE. Requer `Content-Type: application/json`. Payload mínimo:
```json
{
  "texto": "Oi, Eco!",
  "messages": []
}
```
O handler detecta `Accept: text/event-stream` e converte em streaming mesmo no POST; para resposta síncrona mantenha `Accept: application/json` e omita `stream=true`. Validações retornam `400`/`415` com mensagens específicas (`missing_guest_id`, `unsupported_media_type`).【F:server/routes/promptRoutes.ts†L632-L743】

## Feedback e sinais
### `POST /api/feedback`
- **Body**: `interaction_id` (obrigatório), `vote` (`up`/`down`), opcional `response_id`, `reason`, `pillar`, `arm`.
- **Processo**: busca interação existente, infere `arm` via `eco_module_usages` quando necessário, grava feedback em `analytics.eco_feedback` e registra recompensa em `analytics.bandit_rewards` (+1/-1).【F:server/controllers/feedbackController.ts†L32-L200】
- **Respostas**: `204 No Content` sucesso; `400 missing_vote/missing_interaction_id`; `404 interaction_not_found`; `500 feedback_store_failed/bandit_reward_failed`.

Exemplo:
```bash
curl -i -X POST http://localhost:3001/api/feedback \
  -H 'Content-Type: application/json' \
  -H 'X-Eco-Guest-Id: <uuid-v4>' \
  -H 'X-Eco-Session-Id: <uuid-v4>' \
  -d '{"interaction_id":"00000000-0000-0000-0000-000000000001","vote":"up"}'
```

### `POST /api/signal`
- **Body**: evento passivo `{ "signal": "string", "meta": {...} }` (até 32 KB). Limite de 10 requisições por segundo por guest/IP; excesso retorna `204` silencioso para evitar bursts.【F:server/routes/signalRoutes.ts†L9-L59】
- **Resposta**: delegada a `registrarSignal` (ver controlador correspondente). OPTIONS retorna `204` com CORS.【F:server/routes/signalRoutes.ts†L55-L59】

### `POST /api/guest/claim`
- **Autenticação**: `Authorization: Bearer <token Supabase>` obrigatório; valida usuário via `supabase.auth.getUser`.
- **Body**: `guestId` (ou variantes `guest_id`, `id`) com ou sem prefixo `guest_`.
- **Efeito**: migra `referencias_temporarias` do guest para o usuário autenticado, zera contadores de rate limit e bloqueia o guest ID para novos usos; dispara evento Mixpanel `guest_claimed`. Responde `204` em sucesso.【F:server/routes/guestRoutes.ts†L70-L137】

## Memórias e analytics
### `GET /api/memorias`, `POST /api/memorias`
Rotas herdadas exportadas por `domains/memory/routes`. Incluem endpoints para busca semântica (`/api/similares_v2`) protegidos por `requireAdmin`. Consulte o módulo para detalhes específicos.【F:server/core/http/app.ts†L316-L327】

### `GET /api/module-usage/*`
Expose estatísticas de uso de módulos (bandits). Require autenticação apropriada conforme middleware configurado no roteador.【F:server/core/http/app.ts†L304-L323】

## Cabeçalhos e CORS
- `Access-Control-Allow-Origin` espelha origens da allowlist (`CORS_ALLOWLIST` + padrões `*.vercel.app`).【F:server/middleware/cors.ts†L1-L70】
- Respostas SSE adicionam `Access-Control-Expose-Headers: x-eco-guest-id, x-eco-session-id, x-eco-client-message-id` permitindo que o front leia os IDs gerados.【F:server/utils/sse.ts†L13-L46】
- HEAD em `/api/ask-eco` e `/api/ask-eco2` devolve `204` com headers CORS para inspeções rápidas.【F:server/core/http/app.ts†L139-L147】
