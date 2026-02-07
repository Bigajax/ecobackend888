# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ECO is an emotionally-aware conversational AI backend built with Node.js/TypeScript. The system analyzes emotional intensity in user messages, dynamically assembles prompts based on emotional state (3-tier openness levels), streams responses via Server-Sent Events (SSE), and persistently stores meaningful emotional memories in Supabase with semantic search capabilities.

The backend orchestrates a sophisticated pipeline: guest/identity validation → emotional decision analysis → dynamic prompt assembly → Claude LLM streaming → memory persistence and analytics tracking.

## Key Technologies

- **Runtime**: Node.js 18+ with TypeScript 5.8
- **Web Framework**: Express.js 5.1
- **Database**: Supabase (PostgreSQL + pgvector for semantic search)
- **LLM**: Claude Sonnet 4.5 via OpenRouter API
- **Real-time**: Server-Sent Events (SSE) for streaming responses
- **Analytics**: Mixpanel + internal analytics tables (Supabase)
- **Voice**: ElevenLabs (TTS) + Google Cloud Speech-to-Text (transcription)
- **Testing**: Jest 30 + ts-jest
- **Validation**: Zod 3.25

## Project Structure

```
ecobackend888/
├── server/                           # Main backend application
│   ├── core/
│   │   ├── http/
│   │   │   ├── app.ts               # Express app creation, CORS, middleware
│   │   │   ├── guestIdentity.ts     # Guest/session ID generation & validation
│   │   │   └── middlewares/         # Rate limiting, logging, query normalization
│   │   ├── ClaudeAdapter.ts         # OpenRouter/Claude streaming integration
│   │   ├── EmotionalAnalyzer.ts     # Emotion taxonomy and scoring
│   │   └── activationTracer.ts      # Module activation tracking
│   ├── services/
│   │   ├── ConversationOrchestrator.ts # Main orchestration engine
│   │   ├── conversation/
│   │   │   ├── ecoDecisionHub.ts    # Emotional intensity & openness level calculation
│   │   │   ├── fastLane.ts          # Fast-path greeting detection
│   │   │   ├── streamingOrchestrator.ts # SSE lifecycle & event handling
│   │   │   ├── responseFinalizer.ts # Post-LLM processing & memory persistence
│   │   │   ├── memoryPersistence.ts # Emotional memory save logic
│   │   │   ├── contextCache.ts      # Context caching strategy
│   │   │   ├── interactionAnalytics.ts # Interaction tracking
│   │   │   └── genericAutoReplyGuard.ts # Auto-reply detection
│   │   ├── promptContext/
│   │   │   ├── ContextBuilder.ts    # Dynamic multi-layer prompt assembly (27KB)
│   │   │   ├── ModuleStore.ts       # Prompt module loading & caching
│   │   │   ├── moduleManifest.ts    # Module metadata & activation rules
│   │   │   ├── heuristicsV2.ts      # Heuristic rule evaluation
│   │   │   ├── familyBanditPlanner.ts # Multi-armed bandit integration
│   │   │   ├── calPlanner.ts        # Token budget & knapsack optimization
│   │   │   ├── promptPlan/          # Prompt planning utilities
│   │   │   └── logger.ts            # Structured logging
│   │   ├── analytics/
│   │   │   ├── analyticsOrchestrator.ts # Analytics event finalization
│   │   │   └── banditRewardsSync.ts # Bandit reward synchronization scheduler
│   │   ├── supabase/
│   │   │   ├── semanticMemoryClient.ts # Memory search & retrieval (RPC calls)
│   │   │   └── buscarMemorias.ts    # Semantic search wrapper
│   │   ├── MemoryService.ts         # Memory CRUD operations
│   │   ├── buscarReferenciasSemelhantes.ts # Temporary reference retrieval
│   │   ├── supabaseClient.ts        # Supabase admin/analytics client factory
│   │   ├── registrarTodasHeuristicas.ts # Dynamic heuristic registration
│   │   └── registrarModulosFilosoficos.ts # Philosophical module registration
│   ├── routes/
│   │   ├── promptRoutes.ts          # POST /api/ask-eco (SSE endpoint, 68KB)
│   │   ├── askEcoModern.ts          # Stub handler for testing
│   │   ├── openrouterRoutes.ts      # LLM integration endpoints
│   │   ├── voiceFullRoutes.ts       # Voice transcription & response
│   │   ├── perfilEmocionalRoutes.ts # Emotional profile endpoints
│   │   ├── memoriasRoutes.ts        # Memory CRUD routes
│   │   ├── feedbackRoutes.ts        # Feedback collection
│   │   ├── signalRoutes.ts          # Passive behavior signals
│   │   ├── relatorioEmocionalRoutes.ts # Emotional reports
│   │   ├── guestRoutes.ts           # Guest account claim
│   │   └── askEco/                  # Legacy conversation routes
│   ├── controllers/
│   │   ├── memoriasController.ts    # Memory endpoint handlers (17KB)
│   │   ├── feedbackController.ts    # Feedback submission
│   │   ├── signalController.ts      # Signal reception
│   │   └── voiceController.ts       # Voice processing
│   ├── adapters/
│   │   ├── ClaudeAdapter.ts         # Claude LLM adapter (duplicate in core/)
│   │   ├── SupabaseAdapter.ts       # Supabase client wrapper
│   │   ├── OpenRouterAdapter.ts     # OpenRouter API wrapper
│   │   ├── embeddingService.ts      # OpenAI embeddings
│   │   └── supabaseMemoryRepository.ts # Memory persistence layer
│   ├── middleware/
│   │   ├── cors.ts                  # CORS configuration & whitelist
│   │   ├── ensureIdentity.ts        # JWT validation & header injection
│   │   └── errorHandler.ts          # Global error handler
│   ├── domains/
│   │   ├── memory/
│   │   │   ├── controller.ts        # Memory CRUD handlers (13KB)
│   │   │   ├── memoryQueries.ts
│   │   │   └── types.ts
│   │   ├── mensagem/
│   │   │   └── types.ts
│   │   └── prompts/
│   │       └── ModuleCatalog.ts     # Module registry & lookup
│   ├── sse/
│   │   ├── sseEvents.ts             # SSE event serialization (34KB)
│   │   ├── sseState.ts              # Stream state management
│   │   └── chunkProcessor.ts
│   ├── deduplication/
│   │   ├── activeStreamManager.ts   # Stream deduplication & concurrency control
│   │   ├── clientMessageRegistry.ts # Client message ID tracking
│   │   └── interactionManager.ts
│   ├── analytics/
│   │   └── events/
│   │       └── mixpanelEvents.ts    # Mixpanel event definitions & payloads
│   ├── utils/
│   │   ├── text.ts                  # Token counting & text utilities
│   │   ├── http.ts                  # HTTP response helpers
│   │   ├── sse.ts                   # SSE response creation
│   │   ├── logger.ts                # Structured logging utilities
│   │   └── types.ts                 # Shared TypeScript types
│   ├── validation/
│   │   ├── schemas.ts               # Zod validation schemas
│   │   └── sanitize.ts              # Input sanitization
│   ├── bootstrap/
│   │   └── modules.ts               # Module catalog initialization
│   ├── scripts/
│   │   ├── modulesInventory.ts      # Module listing & inventory
│   │   ├── smokeFeedback.ts         # Feedback system smoke test
│   │   ├── testSupabasePersistence.ts # Supabase integration test
│   │   ├── banditPosteriorCache.ts  # Bandit cache warming
│   │   ├── cronSelfTest.ts          # Health check script
│   │   └── pilotSmoke.ts            # Pilot program smoke test
│   ├── assets/                      # Prompt modules (TXT files)
│   │   ├── modulos_core/
│   │   │   ├── developer_prompt.txt
│   │   │   ├── nv1_core.txt         # Level 1 openness (surface)
│   │   │   ├── nv2_reflection.txt   # Level 2 openness (reflection)
│   │   │   ├── nv3_profundo.txt     # Level 3 openness (depth)
│   │   │   ├── eco_estrutura_de_resposta.txt
│   │   │   ├── identidade_mini.txt
│   │   │   └── usomemorias.txt      # Memory usage instructions
│   │   └── modulos_extras/
│   │       ├── bloco_tecnico_memoria.txt
│   │       ├── escala_abertura_1a3.txt
│   │       ├── eco_*.txt            # Philosophical modules
│   │       └── heuristicas_*.txt    # Heuristic modules
│   ├── data/                        # Data utilities
│   ├── lib/
│   │   ├── supabaseAdmin.ts         # Supabase admin client
│   │   └── mixpanel.ts              # Mixpanel client wrapper
│   ├── types/
│   │   └── index.ts
│   ├── schemas/
│   │   └── memory.sql
│   ├── server.ts                    # Main entry point (boot)
│   ├── jest.contract.config.ts      # Jest contract test config
│   ├── tsconfig.json
│   ├── package.json                 # Backend dependencies
│   └── dist/                        # Compiled JavaScript output
├── tests/                           # Root-level test directory
│   ├── analytics/                   # Analytics tests
│   ├── bandits/                     # Bandit algorithm tests
│   ├── core/                        # Core utility tests
│   ├── orchestrator/                # Orchestration tests
│   └── promptPlan/                  # Prompt planning tests
├── __tests__/                       # Alternative test directory (legacy)
├── docs/                            # Documentation
├── supabase/                        # Supabase migrations & schema
│   └── migrations/
├── src/                             # Root-level utilities & types
│   └── utils/
│       └── assetsRoot.ts            # Assets directory resolution
├── jest.config.ts                   # Root Jest config
├── tsconfig.json                    # Root TypeScript config
├── package.json                     # Root package.json
└── README.md                        # Project documentation
```

## Core Request Pipeline

```
1. POST /api/ask-eco (promptRoutes.ts:L592-L847)
   ↓
2. Identity validation (guestIdentity.ts, ensureIdentity.ts)
   ↓
3. ActiveStreamManager deduplication check
   ↓
4. ConversationOrchestrator.getEcoResponse()
   ├─ Greeting detection via fastLane.ts
   ├─ EcoDecision calculation (intensity 0-10, openness 1-3)
   ├─ ContextBuilder.prepareConversationContext()
   │  ├─ Load required modules (core, behavioral, philosophical, heuristic)
   │  ├─ Module selection via familyBanditPlanner or heuristics
   │  ├─ Memory search via semanticMemoryClient (RPC buscar_memorias_semanticas_v2)
   │  ├─ Token budget planning via calPlanner (knapsack optimization)
   │  └─ Prompt assembly with memory integration
   ├─ ClaudeAdapter.streamOpenRouter()
   │  └─ OpenRouter API streaming via axios (JSON mode + stream support)
   ├─ StreamingOrchestrator SSE event emission
   │  ├─ prompt_ready event
   │  ├─ first_token event with latency
   │  ├─ chunk events (text fragments)
   │  ├─ memory_saved event (if intensity ≥7)
   │  └─ done event with stats
   ├─ ResponseFinalizer post-processing
   │  ├─ Emotion extraction from response
   │  ├─ Memory persistence to public.memories (if intensity ≥7 && !guest)
   │  └─ Analytics finalization
   └─ AnalyticsOrchestrator async event tracking (withAnalyticsFinalize)
      ├─ Mixpanel event dispatch
      ├─ Analytics table inserts
      └─ Bandit reward tracking
```

## Development Quick Start

### Installation & Setup

```bash
# Install dependencies
npm install

# Configure environment variables
cp .env.sample .env
# Edit .env with your Supabase and OpenRouter credentials

# Run in development mode
npm run dev
# Starts nodemon on server/server.ts with hot reload
```

### Build & Run for Production

```bash
# Type check & compile
npm run build
# Outputs to: server/dist/

# Start production server
npm start
# NODE_ENV=production node server/dist/server.ts
```

### Common Development Commands

```bash
# View all loaded prompt modules
npm run modules:inventory

# Dump module contents to terminal
npm run modules:dump

# Test Supabase persistence layer
npm run test:supabase

# Run all Jest tests
npm test

# Run specific test suite
npm test -- --testNamePattern="ecoDecision"

# Run smoke tests
npm run shadow:smoke
npm run pilot:smoke
npm run smoke:feedback
```

### Key Environment Variables for Development

```bash
# Required
OPENROUTER_API_KEY=sk-or-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxx...
SUPABASE_ANON_KEY=eyJxx...

# Optional (development defaults)
PORT=3001
NODE_ENV=development
ECO_DEBUG=true
USE_STUB_ECO=false            # true to skip LLM, use stub responses

# SSE tuning
ECO_SSE_TIMEOUT_MS=55000      # Max time without events before closing
ECO_FIRST_TOKEN_TIMEOUT_MS=35000 # Watchdog before fallback
ECO_SSE_PING_INTERVAL_MS=12000   # Heartbeat interval

# Voice (optional)
ELEVEN_VOICE_ID=21m00Tcm4TlvDq8ikWAM
ECO_ELEVENLABS_API_KEY=...

# Analytics (optional, logs to stderr if disabled)
MIXPANEL_SERVER_TOKEN=...
ECO_ANALYTICS_ENABLED=true
```

## Critical Files & Key Concepts

### Main Orchestration

**ConversationOrchestrator** (`services/ConversationOrchestrator.ts`):
- Entry point for all conversation requests
- Delegates to: ecoDecision → contextBuilder → streamingOrchestrator → finalizer
- Handles guest vs authenticated user flows
- Returns streaming SSE response or fallback JSON

**streamingOrchestrator** (`services/conversation/streamingOrchestrator.ts`):
- Manages SSE event lifecycle
- Emits: `prompt_ready` → `first_token` → `chunk` (many) → `memory_saved` → `done`
- Implements watchdog timers (first token timeout, idle timeout)
- Handles provider silence gracefully with fallback logic

### Emotional Intelligence

**ecoDecisionHub** (`services/conversation/ecoDecisionHub.ts`):
- Analyzes message for emotional intensity (0-10 scale)
- Derives openness level (1-3):
  - Level 1 (Surface): intensity < 5
  - Level 2 (Reflection): intensity 5-6 or moderate vulnerability
  - Level 3 (Depth): intensity ≥7 with vulnerability signals
- Determines if memory should be saved (intensity ≥7 && !guest)

**responseFinalizer** (`services/conversation/responseFinalizer.ts`):
- Post-processes Claude response
- Extracts emotion and technical blocks from response
- Persists to `public.memories` if emotional intensity threshold met
- Updates user emotional profile statistics

### Context & Prompt Assembly

**ContextBuilder** (`services/promptContext/ContextBuilder.ts`):
- Multi-layer prompt assembly based on emotional state
- Module categories:
  - **Core** (always): developer_prompt, identidade, estrutura_resposta
  - **Behavioral** (level-based): nv1_core, nv2_reflection, nv3_profundo
  - **Philosophical** (level ≥2): eco_observador_presente, eco_corpo_emocao, etc.
  - **Heuristic** (rule-based): eco_heuristica_disponibilidade, etc.
  - **Crisis** (high intensity): eco_crise_sensivel
- Integrates semantic memories via multi-factor scoring
- Caches context for repeated requests (5min hot cache, 30min stable)

**ModuleStore** (`services/promptContext/ModuleStore.ts`):
- Loads prompt modules from `/server/assets/modulos_*/*.txt`
- Pre-compiles and caches module content
- Tracks module activation for analytics
- Supports hot reload in development

### Memory & Semantic Search

**semanticMemoryClient** (`services/supabase/semanticMemoryClient.ts`):
- Calls Supabase RPC `buscar_memorias_semanticas_v2`
- Multi-factor scoring:
  - Semantic similarity (cosine distance on pgvector embeddings)
  - Emotional similarity (optional embedding_emocional)
  - Temporal recency (exponential decay)
  - Tag overlap coefficient
  - Life domain matching bonus
- Returns top K memories within token budget
- Implements MMR (Maximum Marginal Relevance) for diversity

**MemoryService** (`services/MemoryService.ts`):
- CRUD operations on `public.memories` and `public.referencias_temporarias`
- Row-Level Security enforced: users see only their own memories
- Persists memories only when intensity ≥7
- Automatic expiration of temporary references (max 30 days)

### Real-time Streaming (SSE)

**promptRoutes.ts** (POST `/api/ask-eco`):
- Validates request identity & deduplicates via activeStreamManager
- Sets up SSE response headers
- Delegates to ConversationOrchestrator for orchestration
- Implements JSON fallback if client fails to connect to SSE
- Watchdog timers prevent silent hangs:
  - `firstTokenWatchdogMs` (35s default) - triggers fallback if no first token
  - `streamIdleTimeoutMs` (55s default) - closes stream if no activity
  - `streamPingIntervalMs` (12s default) - sends heartbeat pings

**sseEvents.ts** (`sse/sseEvents.ts`):
- Serializes SSE events (control, chunk, done, memory_saved, error)
- Calculates first-token latency
- Handles chunk buffering and ordering
- Implements ping/heartbeat mechanism

### Testing

The project uses Jest with TypeScript support. Key test directories:

- **Contract Tests** (`server/tests/contract/`): API contract tests
  - `askEco.sse.spec.ts` - SSE endpoint behavior
  - `feedback.spec.ts` - Feedback API
  - `similaresV2.spec.ts` - Memory search RPC
- **Unit Tests** (`tests/`): Service logic tests
  - `ecoDecisionPipeline.test.ts` - Emotional decision calculations
  - `contextBuilder.test.ts` - Prompt assembly
  - `fastLane.test.ts` - Greeting detection

Run tests:
```bash
npm test                          # All tests
npm test -- --watch               # Watch mode
npm run test:supabase            # Integration tests
```

## Database Schema

### Core Tables (Supabase PostgreSQL)

**`public.memories`** (Persistent emotional memories):
```sql
- id: UUID primary key
- usuario_id: UUID (RLS enforced)
- texto: TEXT (memory content, 3-3000 tokens)
- intensidade: FLOAT (0-10 scale)
- emocao_principal: TEXT (emotion taxonomy)
- tags: TEXT[] (snake_case tags)
- embedding: vector(1536) (semantic embedding from OpenAI)
- embedding_emocional: vector(768) (optional emotional embedding)
- dominio_vida: TEXT (work|relationships|health|finances|other)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
- pin: BOOLEAN (manual retention)
- mensagem_id: UUID (link to original interaction)
```

**`public.referencias_temporarias`** (Ephemeral references <7 intensity):
- Same structure as memories
- `expires_at: TIMESTAMP` (auto-delete after 30 days)

**`analytics.quality_metrics`**:
- Tracks response quality, user satisfaction scores

**`analytics.bandit_state`**:
- Stores multi-armed bandit arm weights and performance metrics

**`analytics.knapsack_results`**:
- Records module selection decisions and outcomes

### Indexes
- HNSW index on `memories.embedding` for fast semantic search
- Partial indexes filtered by `usuario_id` and creation date
- GiST indexes on emotional patterns

## Architecture Patterns

### 1. Conversation Orchestration
Pipeline pattern: greeting → decision → context → stream → finalize. Each stage has well-defined inputs/outputs for easy testing and modification.

### 2. Emotional Awareness
3-tier openness system (1=surface, 2=reflection, 3=depth) determines which modules load and how memories integrate. Dynamic prompt assembly adapts tone and depth.

### 3. Streaming with Fallbacks
SSE preferred for real-time, JSON fallback for connectivity issues. Watchdog timers prevent silent failures. Client-side streams deduplicated by `client_message_id`.

### 4. Memory as Context
Semantic search finds emotionally relevant memories. MMR prevents redundancy. Memories only persist when intensity ≥7 (meaningful moments). Guests don't accumulate permanent memories.

### 5. Analytics-Driven Optimization
Bandit algorithm selects modules. Heuristic rules prime selection. Quality metrics tracked per interaction. Rewards synced periodically to optimize future decisions.

### 6. Privacy by Design
RLS enforces user isolation in all memory queries. Service role used only for admin operations. Guests session-scoped, not persisted long-term.

## Common Development Tasks

### Adding a New Memory Field

1. Create Supabase migration: `supabase/migrations/xxx_add_field.sql`
2. Update `MemoryService` type definitions
3. Update RPC `buscar_memorias_semanticas_v2` if searchable
4. Add to memory persistence in `responseFinalizer.ts`
5. Update tests in `server/tests/contract/`

### Tuning Emotional Decision Logic

1. Edit `ecoDecisionHub.ts` intensity calculation thresholds
2. Adjust openness level breakpoints (currently 5, 6, 7)
3. Modify vulnerability patterns in pattern matching
4. Run tests: `npm test -- --testNamePattern="ecoDecision"`
5. Check impact via `npm run modules:inventory` output

### Optimizing Context Assembly

1. Adjust module weights in `familyBanditPlanner.ts`
2. Add heuristic rules in `heuristicsV2.ts`
3. Modify token budgets in `calPlanner.ts`
4. Update cache TTL in `contextCache.ts`
5. Monitor via `/api/health` module activation stats

### Testing Streaming Behavior

1. Use `USE_STUB_ECO=true` to test without LLM calls
2. Enable `ECO_DEBUG=true` for detailed logs
3. Run: `npm run shadow:smoke` for end-to-end flow
4. Check SSE event ordering in `sseEvents.ts` test
5. Verify fallback JSON behavior in `promptRoutes.ts:L800-L847`

## Important Notes

### Modules & Assets

The system requires prompt modules to be present at startup. Missing modules cause fatal errors:

```
REQUIRED_MODULE_PATHS = [
  "modulos_core/developer_prompt.txt",
  "modulos_core/nv1_core.txt",
  "modulos_core/identidade_mini.txt",
  ...
]
```

Use `npm run verify:assets` before deploying to ensure all modules are bundled.

### OpenRouter/Claude Configuration

The system currently defaults to `anthropic/claude-sonnet-4.5-20250929` via OpenRouter. To change:

1. Set `ECO_CLAUDE_MODEL=anthropic/claude-3-haiku` (or other OpenRouter model)
2. Adjust `ECO_MAX_PROMPT_TOKENS` if needed for model context limits
3. Test streaming behavior via `npm run shadow:smoke`

### Supabase Connection

Analytics and memory operations require service role key:
- Admin client (bypass RLS): `SUPABASE_SERVICE_ROLE_KEY`
- Analytics isolation: `SUPABASE_ANALYTICS_SERVICE_ROLE_KEY` (optional override)
- User operations: `SUPABASE_ANON_KEY` (client-side bearer)

RLS policies enforce user isolation automatically. Test with `npm run test:supabase`.

### Rate Limiting

The system enforces rate limits on three dimensions:
- Per JWT token (authenticated users)
- Per guest session (anonymous users)
- Per IP address (global)

Configured via:
- `API_RATE_LIMIT_WINDOW_MS` (60s default)
- `API_RATE_LIMIT_MAX_REQUESTS` (60/min default)
- `GUEST_RATE_LIMIT` (30 requests per 1 minute)

Override in development: `API_RATE_LIMIT_MAX_REQUESTS=1000` for testing.

## Debugging

### Enable Debug Mode
```bash
ECO_DEBUG=true npm run dev
```

This enables:
- Verbose logging for Supabase queries
- Module activation tracing
- Analytics event inspection
- SSE event detailed logs

### Check Module Loading
```bash
npm run modules:inventory
npm run modules:dump
```

### Health Check
```bash
curl http://localhost:3001/api/health
# Returns: module status, database connectivity, active streams
```

### Stub Mode (No LLM calls)
```bash
USE_STUB_ECO=true npm run dev
# Returns fixed responses, useful for frontend testing
```

### Trace Request Flow
1. Add console.log in `ConversationOrchestrator.ts`
2. Set `ECO_DEBUG=true`
3. Make request to `/api/ask-eco`
4. Check terminal output for detailed pipeline trace

## External API Integrations

### OpenRouter/Claude
- **Endpoint**: `https://openrouter.io/api/v1/chat/completions`
- **Auth**: `Authorization: Bearer ${OPENROUTER_API_KEY}`
- **Models**: anthropic/claude-sonnet-4.5-20250929 (principal), anthropic/claude-3-haiku (fast-lane, configurable)
- **Streaming**: Supported via `stream: true`
- **Timeout**: Configurable via `OPENROUTER_TIMEOUT_MS` (30s default)

### Supabase (PostgreSQL + pgvector)
- **RPC**: `buscar_memorias_semanticas_v2` - semantic search with multi-factor scoring
- **Tables**: memories, referencias_temporarias, analytics.* (analytics schema)
- **Auth**: JWT via `SUPABASE_ANON_KEY` (client ops), Service role for admin
- **Vectors**: 1536-dim semantic embeddings (OpenAI), 768-dim emotional (optional)

### Mixpanel
- **Endpoint**: `https://api.mixpanel.com`
- **Events**: eco_message, memory_created, first_token_latency, feedback_submitted
- **Auth**: Server token via `MIXPANEL_SERVER_TOKEN`
- **Fallback**: No-op client if token not provided (development-friendly)

### ElevenLabs (Voice)
- **Endpoint**: `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`
- **Auth**: `xi-api-key: ${ELEVEN_API_KEY}`
- **Models**: Configurable via `ECO_ELEVENLABS_MODEL`
- **Voices**: Default `ELEVEN_VOICE_ID` or per-request override

## Additional Resources

- **Architecture Docs**: `ARCHITECTURE.md`, `API_REFERENCE.md`, `DATA_MODEL.md`
- **Environment Guide**: `ENVIRONMENT.md` (comprehensive variable reference)
- **Security**: `SECURITY.md` (RLS policies, JWT validation, CORS)
- **Observability**: `OBSERVABILITY.md` (logging, metrics, debugging)
- **SSE Details**: `STREAMING_SSE.md` (streaming protocol, resilience)
- **Deployment**: `DEPLOY_RUNBOOK.md` (production checklist)
