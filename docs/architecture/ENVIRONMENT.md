# Variáveis de ambiente
As chaves abaixo são lidas diretamente pelo back-end. Valores ausentes geralmente têm fallback, mas alguns blocos (OpenRouter, Supabase) são obrigatórios para funcionalidades específicas.

## Servidor HTTP & CORS
| Variável | Default | Uso | Fonte |
| --- | --- | --- | --- |
| `PORT` | `3001` | Porta do Express ao iniciar `server.ts`. | `app.listen` usa `Number(process.env.PORT || 3001)`.【F:server/server.ts†L153-L177】 |
| `CORS_ALLOWLIST` | Lista embutida (`localhost`, `ecofrontend888.vercel.app`, `*.vercel.app`) | Origem adicional permitida (CSV ou regex). | Processado em `middleware/cors.ts`.【F:server/middleware/cors.ts†L1-L60】 |
| `API_RATE_LIMIT_WINDOW_MS`, `API_RATE_LIMIT_MAX_REQUESTS` | `60000`, `60` | Janela e limite global por token/guest/IP. | `createApp` aplica `apiRateLimiter`.【F:server/core/http/app.ts†L62-L113】 |
| `NODE_KEEP_ALIVE_TIMEOUT_MS`, `NODE_HEADERS_TIMEOUT_MS` | `70000`, `75000` | Documentados em `/api/_eco-contract` para clientes. | `eco contract` expõe valores lidos do ambiente. 【F:server/core/http/app.ts†L215-L309】 |

## Identidade, convidados e deduplicação
| Variável | Default | Uso |
| --- | --- | --- |
| `ECO_REQUIRE_GUEST_ID` | `false` | Força rejeição se `guest_id` não for enviado explicitamente (mesmo com cookie).【F:server/routes/promptRoutes.ts†L440-L448】 |
| `ECO_ACTIVE_INTERACTION_TTL_MS` | `45000` (implícito) | TTL dos locks de interação ativa; controla quantos streams simultâneos são permitidos. | Usado em `activeStreamManager`.【F:server/deduplication/activeStreamManager.ts†L1-L160】 |
| `ECO_CLIENT_MESSAGE_ACTIVE_TTL_MS`, `ECO_CLIENT_MESSAGE_COMPLETED_TTL_MS` | defaults 10s/10min | Deduplicação por `client_message_id`. | `clientMessageRegistry`.【F:server/deduplication/clientMessageRegistry.ts†L1-L180】 |
| `GUEST_RATE_LIMIT`, `GUEST_MAX_INTERACTIONS` | `30/1m`, `6` | Rate limit e número máximo de mensagens para modo convidado. | `guestSessionMiddleware`.【F:server/core/http/middlewares/guestSession.ts†L6-L194】 |

## Streaming SSE
| Variável | Default | Observação |
| --- | --- | --- |
| `ECO_SSE_TIMEOUT_MS` | 55s (clamp 45–60s) | Tempo máximo sem eventos antes de fechar stream. | `streamIdleTimeoutMs`.【F:server/routes/promptRoutes.ts†L442-L459】 |
| `ECO_FIRST_TOKEN_TIMEOUT_MS` | 35s (clamp 30–45s) | Watchdog para emitir fallback se LLM demorar. | `firstTokenWatchdogMs`.【F:server/routes/promptRoutes.ts†L460-L475】 |
| `ECO_SSE_PING_INTERVAL_MS` | 12s (clamp 10–15s) | Intervalo de heartbeats `:heartbeat`. | `streamPingIntervalMs`.【F:server/routes/promptRoutes.ts†L476-L490】 |
| `ECO_STREAM_GUARD_MS` | 2000 | Tempo de guarda para aguardar callbacks antes de declarar silêncio do provedor. | `streamingOrchestrator`.【F:server/services/conversation/streamingOrchestrator.ts†L22-L83】 |

## LLM & prompts
| Variável | Uso | Fonte |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Necessária para chamar Claude/OpenRouter; ausência lança erro de configuração. | `ClaudeAdapter` valida na inicialização.【F:server/core/ClaudeAdapter.ts†L157-L181】 |
| `ECO_CLAUDE_MODEL`, `ECO_CLAUDE_MODEL_FALLBACK` | Define modelo principal e fallback usados pelo orquestrador. | `ClaudeAdapter` seleciona via envs.【F:server/core/ClaudeAdapter.ts†L182-L320】 |
| `ECO_MAX_PROMPT_TOKENS`, `ECO_CONTEXT_BUDGET_TOKENS`, `ECO_KNAPSACK_BUDGET_TOKENS` | Controlam orçamento de tokens para montagem do prompt e módulos aditivos. | `promptPlan` e `decision/calPlanner`.【F:server/services/conversation/promptPlan/index.ts†L1-L160】【F:server/services/decision/calPlanner.ts†L1-L160】 |
| `ECO_MODULES_DIR`, `ECO_PROMPT_ROOTS`, `ECO_MODULE_MANIFEST` | Ajustam diretórios de módulos carregados. | `bootstrap/modules`.【F:server/bootstrap/modules.ts†L1-L200】 |
| `ECO_ASSETS_ROOT` | Diretório raiz dos prompts; sem ele o boot encerra com erro. | `describeAssetsRoot`.【F:server/server.ts†L67-L133】 |

## Supabase & analytics
| Variável | Uso |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Cliente admin (RLS bypass, memórias, RPCs).【F:server/lib/supabaseAdmin.ts†L12-L38】 |
| `SUPABASE_ANALYTICS_SERVICE_ROLE_KEY` | Substitui a service-role padrão apenas para schema `analytics`.【F:server/services/supabaseClient.ts†L7-L24】 |
| `SUPABASE_ANON_KEY` | Necessária para operações que usam bearer do usuário final (memórias RPC). | `ConversationOrchestrator` valida quando `needsSupabase`.【F:server/services/ConversationOrchestrator.ts†L41-L74】 |
| `SUPABASE_FETCH_TIMEOUT_MS` | Documentado no contrato `/api/_eco-contract` para clientes ajustarem timeouts. | `eco contract` expõe valor. 【F:server/core/http/app.ts†L278-L309】 |
| `BANDIT_REWARD_SYNC_INTERVAL_MS`, `BANDIT_REWARD_VIEW`, `BANDIT_REWARD_SYNC_DISABLED` | Controlam sincronização periódica de recompensas offline. | `banditRewardsSync`.【F:server/services/banditRewardsSync.ts†L1-L160】 |
| `ECO_ANALYTICS_ENABLED`, `ECO_BUDGET_ADITIVO_TOKENS` | Flags de analytics; amostra presente em `.env.sample`. | `.env.sample` e `analyticsOrchestrator`.【F:.env.sample†L1-L5】【F:server/services/analytics/analyticsOrchestrator.ts†L80-L151】 |
| `MIXPANEL_SERVER_TOKEN` / `MIXPANEL_TOKEN` / `NEXT_PUBLIC_MIXPANEL_TOKEN` | Inicialização do cliente Mixpanel; ausência cria cliente no-op. | `lib/mixpanel.ts`.【F:server/lib/mixpanel.ts†L6-L44】 |

## Bandits, heurísticas e experimentos
| Variável | Uso |
| --- | --- |
| `ECO_BANDIT_EARLY`, `ECO_BANDIT_SHADOW`, `ECO_BANDIT_PILOT_PERCENT` | Ajustam experimentos de bandit (modo early, shadow routing, % piloto). | `familyBanditPlanner` lê envs para decidir variáveis de exploração.【F:server/services/promptContext/familyBanditPlanner.ts†L181-L189】 |
| `BANDIT_LAMBDA` | (Somente em `.env.sample`; uso não encontrado no código atual) – avaliar necessidade antes de habilitar. | `.env.sample` documenta valor padrão.【F:.env.sample†L1-L5】 |
| `ECO_HEUR_*` (`V2`, `MIN_SCORE_DEFAULT`, `COOLDOWN_TURNS`, `HALF_LIFE_MIN`, `MAX_ARMS_PER_TURN`) | Tunam heurísticas que alimentam o seletor de módulos e priorizam blocos. | `heuristicsResolver` consome esses envs para configurar pesos e decaimento.【F:server/services/promptContext/pipeline/heuristicsResolver.ts†L32-L49】 |
| `REGISTRAR_HEURISTICAS`, `REGISTRAR_FILOSOFICOS` | Quando `true`, scripts de boot importam heurísticas/módulos extras. | `server.ts` chama serviços condicionalmente.【F:server/server.ts†L165-L176】 |

## Voz e integrações externas
| Variável | Uso |
| --- | --- |
| `ELEVENLABS_API_KEY`, `ELEVEN_API_KEY`, `ELEVEN_TOKEN`, `ELEVEN_MODEL_ID`, `ELEVEN_VOICE_ID`, `VOICE_MAX_AUDIO_BYTES` | Configuram rotas de voz (`/api/voice/tts`) e serviço ElevenLabs (modelo, voz padrão, limites de texto). | `voiceTTSRoutes` usa `ELEVEN_VOICE_ID`; `elevenlabsService` valida chaves/modelo e aplica retry. 【F:server/routes/voiceTTSRoutes.ts†L1-L36】【F:server/services/elevenlabsService.ts†L9-L116】 |
| `OPENAI_API_KEY` / `OPENAI_KEY` / `OPENAI_TOKEN` | Suporte a features auxiliares (ex.: embeddings fallback). | `utils/text.ts` valida presença quando necessário.【F:server/utils/text.ts†L8-L40】 |

## Debug & desenvolvimento
| Variável | Efeito |
| --- | --- |
| `ECO_DEBUG` (`"1"`) | Habilita logs extras para analytics e Supabase. | `analyticsOrchestrator` e outros módulos verificam flag.【F:server/services/analytics/analyticsOrchestrator.ts†L97-L165】 |
| `ECO_LOG_LEVEL`, `LOG_LEVEL` | Ajustam verbosidade do logger interno. | `server.ts` loga valores no boot. 【F:server/server.ts†L153-L176】 |
| `USE_STUB_ECO` (`true/false`) | Alterna roteador stub (`askEcoModern`) para testes sem LLM. | `createApp` decide qual handler montar. 【F:server/core/http/app.ts†L300-L312】 |
| `DEBUG_SEMANTICA` (`true`) | Liga logs detalhados da RPC de memórias. | `semanticMemoryClient`.【F:server/services/supabase/semanticMemoryClient.ts†L37-L165】 |
| `DOTENV_PATH` | Caminho explícito para carregar `.env` no boot. | `server.ts` tenta múltiplos caminhos. 【F:server/server.ts†L5-L22】 |

## .env example
Arquivo de referência existente: `.env.sample` (habilita analytics básico, define orçamento aditivo e `BANDIT_LAMBDA`).【F:.env.sample†L1-L5】 Recomenda-se criar um `.env.example` completo contendo ao menos:
```env
# HTTP
PORT=3001
CORS_ALLOWLIST=http://localhost:5173

# LLM
OPENROUTER_API_KEY=chave
ECO_CLAUDE_MODEL=anthropic/claude-3-haiku

# Supabase
SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_ROLE_KEY=service-role
SUPABASE_ANON_KEY=anon-key

# Analytics
MIXPANEL_SERVER_TOKEN=token
ECO_ANALYTICS_ENABLED=true

# SSE tuning
ECO_SSE_TIMEOUT_MS=55000
ECO_FIRST_TOKEN_TIMEOUT_MS=35000
ECO_SSE_PING_INTERVAL_MS=12000
```

## Boas práticas
- Configure timeouts HTTP do proxy alinhados com `NODE_KEEP_ALIVE_TIMEOUT_MS`/`NODE_HEADERS_TIMEOUT_MS` expostos no contrato para evitar desconexões prematuras.【F:server/core/http/app.ts†L215-L309】
- Gere `guest_id`/`session_id` no front em formato UUID v4 para evitar bloqueios do middleware.【F:server/middleware/ensureIdentity.ts†L45-L99】
- Em desenvolvimento, defina `USE_STUB_ECO=true` para testar fluxo SSE sem custos de LLM.【F:server/core/http/app.ts†L300-L312】
