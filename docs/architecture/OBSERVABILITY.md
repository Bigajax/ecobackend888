# Observabilidade

## Logging estruturado
- **Middleware HTTP** – `requestLogger` registra cada requisição com `http.request` contendo método, status, origem, duração (ms) e `guestId` resolvido. Útil para métricas agregadas ou filtragem por origem/CORS.【F:server/core/http/middlewares/logger.ts†L4-L32】
- **Boot** – `server.ts` imprime variáveis críticas (`ECO_LOG_LEVEL`, `ECO_DEBUG`, `analyticsClientMode`) e validação de assets, permitindo detectar configurações incorretas no deploy.【F:server/server.ts†L67-L177】
- **SSE** – `SseEventHandlers` loga `stream_done_event`, `sse_error`, `guard_fallback_emit`, incluindo `streamId`, `clientMessageId` e telemetria de timing para cada conversa.【F:server/sse/sseEvents.ts†L214-L309】
- **CORS** – Preflight responde com log `[cors] preflight` contendo origem e decisão, ajudando a depurar problemas de front-end.【F:server/core/http/app.ts†L121-L147】

## Métricas e telemetria
- **Latência de streaming** – `SseStreamState` captura `firstTokenAt`, `lastChunkAt`, contagem de chunks/tamanho e classifica encerramentos (`client_closed`, `proxy_closed`, `server_abort`). Esses dados abastecem `done` e logs para investigações de rede.【F:server/sse/sseState.ts†L23-L200】
- **Analytics persistidos** – `persistAnalyticsRecords` guarda `ttfb_ms`, `ttlc_ms`, tokens, decisões de bandit/knapsack e heurísticas no schema `analytics`. Falhas são logadas com `persist_failed` quando `ECO_DEBUG=1`.【F:server/services/analytics/analyticsOrchestrator.ts†L80-L165】
- **Bandit sync scheduler** – `startBanditRewardSyncScheduler` (ativado no boot) gera logs a cada sincronização com Supabase, incluindo contagem de recompensas aplicadas (ver serviço correspondente).【F:server/server.ts†L135-L177】【F:server/services/banditRewardsSync.ts†L1-L160】

## Mixpanel
- Cliente inicializa apenas se `MIXPANEL_*` existir; caso contrário um no-op evita erros em desenvolvimento mantendo assinatura compatível.【F:server/lib/mixpanel.ts†L6-L44】
- Eventos rastreados incluem `Mensagem enviada/recebida`, `guest_*`, `Retrieve_Mode`, `Resposta_Q`, `Knapsack_Decision`, `Bandit_Arm_(Pick|Update)` e relatórios de blocos técnicos, todos com `distinct_id` derivado de `guestId`/`userId`. Isso garante correlação entre front-end e backend.【F:server/analytics/events/mixpanelEvents.ts†L34-L206】【F:server/analytics/events/mixpanelEvents.ts†L206-L340】
- Funções `identifyUsuario` e `trackGuestStart` são idempotentes (`register_once`) para evitar duplicação de propriedades em perfis Mixpanel.【F:server/analytics/events/mixpanelEvents.ts†L18-L96】

## Alertas operacionais sugeridos
- **Assets ausentes** – Monitorar logs `[boot] assets_root_unavailable` para falhas críticas de deploy.【F:server/server.ts†L67-L133】
- **SSE fallback** – Alerta quando `guard_fallback_emit` ou `sse_error` se tornarem frequentes (indicador de instabilidade no LLM ou rede).【F:server/sse/sseEvents.ts†L214-L309】
- **Analytics degradados** – Habilitar `ECO_DEBUG=1` em staging para registrar `persist_failed` em Supabase e ajustar chaves antes do deploy.【F:server/services/analytics/analyticsOrchestrator.ts†L97-L165】

## Ferramentas auxiliares
- **`/api/_eco-contract`** – Endpoint público resumindo políticas de CORS, identidade e timeouts para dashboards externos.【F:server/core/http/app.ts†L215-L314】
- **`npm run cors:smoke`** – Script que exercita fluxos CORS/SSE (ver `server/scripts/cors-smoke.sh`) para validar novas origens.【F:server/package.json†L10-L18】
- **`/debug/modules`** – Lista módulos indexados com contagem e amostra de conteúdos, útil para confirmar sincronização de assets.【F:server/core/http/app.ts†L315-L323】
