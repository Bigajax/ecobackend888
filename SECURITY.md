# Segurança

## CORS e exposições
- A allowlist padrão inclui `http://localhost:5173`, `http://localhost:4173` e `https://ecofrontend888.vercel.app`, além de qualquer `*.vercel.app`. Valores adicionais podem ser passados via `CORS_ALLOWLIST` (CSV ou regex). Headers `Access-Control-Allow-Methods`/`Headers` e `Vary` são configurados globalmente pelo middleware.【F:server/middleware/cors.ts†L1-L70】
- Rotas SSE (`/api/ask-eco`) reforçam CORS após cada resposta e expõem apenas `X-Eco-*` via `Access-Control-Expose-Headers`, garantindo que navegadores obtenham identidade mas não outros headers sensíveis.【F:server/routes/promptRoutes.ts†L533-L546】

## Autenticação & identidade
- `ensureGuestIdentity` emite/normaliza `guest_id` (UUID v4) e `session_id`, definindo cookies `guest_id` com `Secure`/`SameSite=None`. Exceções (`/health*`) evitam IDs para probes.【F:server/core/http/guestIdentity.ts†L6-L133】
- `ensureIdentity` rejeita requisições sem `guest_id`/`session_id` válidos em `/api/ask-eco` POST, retornando códigos 400 (`missing_guest_id`, `missing_session_id`, `invalid_guest_id`). Também replica os valores em headers para a resposta, evitando spoofing por query.【F:server/middleware/ensureIdentity.ts†L31-L117】
- `guestSessionMiddleware` aplica rate limit dedicado e bloqueia `guestId` marcados (e.g., após claim). Ele exige header `X-Guest-Mode: true` para aplicar limites, reduzindo interferência em usuários autenticados.【F:server/core/http/middlewares/guestSession.ts†L6-L194】
- Rotas como `/api/guest/claim` exigem `Authorization: Bearer` válido no Supabase; sem token respondem `401`. IDs são normalizados (`guest_<uuid>`), migrados e bloqueados para evitar reuso malicioso.【F:server/routes/guestRoutes.ts†L70-L137】

## Rate limiting
- `apiRateLimiter` limita requisições (por bearer token, guest ou IP) a `API_RATE_LIMIT_MAX_REQUESTS` por `API_RATE_LIMIT_WINDOW_MS`, ignorando `OPTIONS`, `/`, `/healthz`, `/readyz`, `/debug/modules`. Em caso de excesso responde `429` com `Retry-After`.【F:server/core/http/app.ts†L62-L113】
- `/api/signal` possui limitador próprio (10 req/s) para evitar spam de eventos passivos; excedentes retornam `204` silencioso. Logs `signal.rate_limited` ajudam a detectar abusos.【F:server/routes/signalRoutes.ts†L9-L59】

## Proteções contra duplicidade
- `activeStreamManager` mantém mapa de interações ativas usando TTL configurável (`ECO_ACTIVE_INTERACTION_TTL_MS`) e aborta streams concorrentes para o mesmo guest/session. Isso previne race conditions onde múltiplas respostas poderiam ser entregues simultaneamente.【F:server/deduplication/activeStreamManager.ts†L1-L86】
- `clientMessageRegistry` reserva `client_message_id` por janelas separadas para status `active` e `completed`, rejeitando replays e permitindo idempotência de front-end. TTLs configuráveis via `ECO_CLIENT_MESSAGE_*`.【F:server/deduplication/clientMessageRegistry.ts†L1-L75】

## Supabase e RLS
- Memórias e referências temporárias usam RLS (`auth.uid() = usuario_id`), garantindo que usuários leiam apenas seus dados. O backend usa `service_role` para bypass controlado quando necessário (memória do usuário e RPCs).【F:supabase/schema/memory_schema.sql†L90-L132】
- `requireAdmin` carrega o cliente admin (`service_role`) antes de rotas protegidas (e.g. `/api/similares_v2`). Se as credenciais estiverem ausentes responde `500` com detalhes, evitando vazamento de stack traces.【F:server/mw/requireAdmin.ts†L14-L30】【F:server/core/http/app.ts†L304-L323】

## Dados sensíveis e logs
- Logs de feedback/analytics registram IDs (interaction, response, guest) mas não armazenam payloads completos; falhas em Supabase retornam códigos específicos e detalhes limitados para evitar vazamento de informações confidenciais.【F:server/controllers/feedbackController.ts†L32-L200】
- Mixpanel recebe somente metadados (tokens, durações, flags de qualidade) — dados textuais sensíveis não são enviados por padrão, reduzindo risco de exposição de conteúdo do usuário.【F:server/analytics/events/mixpanelEvents.ts†L34-L206】

## Boas práticas adicionais
- Habilite HTTPS e proxies que respeitem `Connection: keep-alive` e `Cache-Control: no-transform` para manter a integridade do stream.【F:server/utils/sse.ts†L6-L70】
- Gere `guest_id`/`session_id` no cliente usando UUID v4 e renove `session_id` por sessão para melhorar rastreamento e revogação em caso de abuso.【F:server/core/http/guestIdentity.ts†L14-L133】
- Monitore respostas `403 origin_blocked` para ajustar `CORS_ALLOWLIST` quando novos domínios legítimos forem adicionados.【F:server/routes/promptRoutes.ts†L696-L734】
