# Arquitetura técnica

## Pipeline de requisição
1. **Bootstrap** – `server.ts` carrega variáveis de ambiente, valida o diretório de módulos (`ECO_ASSETS_ROOT`) e inicia serviços auxiliares (catálogo de módulos, sincronização de bandits, heurísticas opcionais).【F:server/server.ts†L5-L177】
2. **Express app** – `createApp()` aplica CORS, parsing condicional de JSON, identidade de convidados, rate limiting e middlewares de sessão antes de expor rotas de domínio.【F:server/core/http/app.ts†L121-L200】【F:server/core/http/app.ts†L248-L331】
3. **Identidade** – `ensureGuestIdentity` gera/propaga `guest_id`/`session_id` exceto em rotas públicas, enquanto `ensureIdentity` valida UUIDs nos headers e injeta `X-Eco-*` na requisição; `guestSessionMiddleware` limita requisições anônimas via janelas configuráveis.【F:server/core/http/guestIdentity.ts†L6-L198】【F:server/middleware/ensureIdentity.ts†L19-L117】【F:server/core/http/middlewares/guestSession.ts†L52-L194】
4. **Roteadores** – As rotas principais incluem:
   - `/api/ask-eco`: fluxo SSE/JSON para conversas.【F:server/routes/promptRoutes.ts†L592-L847】
   - `/api/memorias` & aliases: CRUD e buscas de memórias emocionais.【F:server/core/http/app.ts†L316-L327】
   - `/api/feedback`, `/api/signal`, `/api/guest/claim`: feedback operacional, sinais passivos e associação de convidados.【F:server/controllers/feedbackController.ts†L32-L200】【F:server/routes/signalRoutes.ts†L9-L59】【F:server/routes/guestRoutes.ts†L70-L140】
   - `/api/_eco-contract`, `/api/health`: introspecção do serviço (headers, timeouts, status de prompts).【F:server/core/http/app.ts†L198-L246】
5. **Orquestrador conversacional** – `ConversationOrchestrator` decide o caminho (fast/full), seleciona módulos, prepara contexto Supabase e delega streaming para `streamingOrchestrator`. Analytics são persistidos assincronamente via `withAnalyticsFinalize`.【F:server/services/ConversationOrchestrator.ts†L1-L181】【F:server/services/orchestration/streamingPath.ts†L10-L45】
6. **Streaming SSE** – `streamingOrchestrator` produz eventos (`control`, `chunk`, `done`, `memory_saved`) e salva memórias, enquanto `SseEventHandlers` agrega chunks, calcula latência e envia fallback em caso de silêncio do provedor.【F:server/services/conversation/streamingOrchestrator.ts†L84-L213】【F:server/sse/sseEvents.ts†L187-L318】
7. **Persistência e analytics** – A camada de dados usa Supabase para memórias (`memories`, `referencias_temporarias`) e analytics (`analytics.*`). RPCs (`buscar_memorias_semelhantes_v2`) executam ranqueamento com thresholds adaptativos. Mixpanel registra eventos assíncronos via cliente minimalista.【F:supabase/schema/memory_schema.sql†L12-L132】【F:supabase/schema/analytics_schema.sql†L1-L83】【F:server/services/supabase/semanticMemoryClient.ts†L96-L198】【F:server/analytics/events/mixpanelEvents.ts†L34-L206】

## Papéis dos módulos principais
| Módulo | Responsabilidade | Interações |
| --- | --- | --- |
| `core/http` | Configura app Express (CORS, parsers, rate limiting, identidade) e roteadores raiz. | Boot + todas as requisições.【F:server/core/http/app.ts†L121-L331】 |
| `routes/promptRoutes.ts` | Implementa `/api/ask-eco` com SSE, deduplicação (`activeStreamManager`), validações e fallback JSON. | Cliente conversa ↔ Orquestrador.【F:server/routes/promptRoutes.ts†L592-L1107】 |
| `services/ConversationOrchestrator.ts` | Coordena pipelines pré/pós-LLM, chamada ao Claude via OpenRouter, heurísticas, seleção de memórias e analytics. | LLM + Supabase + SSE.【F:server/services/ConversationOrchestrator.ts†L1-L181】 |
| `services/conversation/streamingOrchestrator.ts` | Encapsula streaming do Claude, emite eventos, salva memórias e calcula uso de tokens. | SSE + Mixpanel/analytics.【F:server/services/conversation/streamingOrchestrator.ts†L132-L318】 |
| `services/supabase/*` | Clientes Supabase admin/service-role e RPCs para memórias, gravação de analytics. | Persistência + busca de contexto.【F:server/services/supabase/semanticMemoryClient.ts†L96-L198】【F:server/services/analytics/analyticsOrchestrator.ts†L80-L165】 |
| `analytics/events/mixpanelEvents.ts` | Normaliza payloads Mixpanel para mensagens, memórias, bandits e latência. | Observabilidade de produto.【F:server/analytics/events/mixpanelEvents.ts†L34-L206】 |
| `middleware/ensureIdentity.ts` | Valida e injeta `X-Eco-Guest-Id`/`Session-Id` exigindo UUID v4 em requisições não autenticadas. | Segurança/CORS.【F:server/middleware/ensureIdentity.ts†L19-L117】 |
| `sse/*` | Estado do stream, eventos e telemetria (watchdogs, guard fallback, done envelope). | Camada SSE resiliente.【F:server/sse/sseEvents.ts†L187-L318】【F:server/sse/sseState.ts†L1-L200】 |
| `supabase/schema` | Scripts SQL para memórias (RLS + embeddings) e analytics (qualidade, bandits, knapsack, latência). | Fonte de verdade do modelo de dados.【F:supabase/schema/memory_schema.sql†L12-L132】【F:supabase/schema/analytics_schema.sql†L1-L83】 |

## Interações externas
- **OpenRouter/Claude** – Requer `OPENROUTER_API_KEY`; o adaptador lança erro se a chave estiver ausente, garantindo falha explícita em ambientes mal configurados.【F:server/core/ClaudeAdapter.ts†L157-L181】
- **Supabase** – `supabaseClient.ts` cria cliente `analytics` apenas quando URL e chave service-role estão disponíveis, logando erros caso contrário.【F:server/services/supabaseClient.ts†L7-L24】
- **Mixpanel** – Cliente no-op quando nenhum token é fornecido para evitar falhas em desenvolvimento, mantendo API consistente.【F:server/lib/mixpanel.ts†L6-L44】
