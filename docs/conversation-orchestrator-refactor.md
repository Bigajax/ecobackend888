# ConversationOrchestrator refactor proposal

## Pain points observed

- `ConversationOrchestrator.ts` currently mixes imports from adapters, caching, heuristics, prompt construction, analytics and delivery inside a single function, which makes the file sprawl to ~650 lines and multiple responsibilities. 【F:server/services/ConversationOrchestrator.ts†L1-L657】
- The `getEcoResponse` flow alone contains routing, greeting handling, asynchronous fetches, prompt building, LLM invocation, response shaping, side-effects (memory persistence, analytics) and fallback logic in-line. 【F:server/services/ConversationOrchestrator.ts†L278-L654】
- Helper utilities such as `operacoesParalelas`, `fastLaneLLM`, and `montarContextoOtimizado` are embedded in the same module even though they could be reused/tested independently. 【F:server/services/ConversationOrchestrator.ts†L92-L266】

## Suggested modular split

1. **Entry-point orchestrator**
   - Keep a lean `getEcoResponse` that orchestrates high-level steps by composing collaborators.
   - Extract external dependencies behind interfaces (e.g. `ClaudeClient`, `SupabaseClient`, `ContextBuilderService`) that can be injected.

2. **Greeting and micro-response pipeline**
   - Move greeting detection (`respostaSaudacaoAutomatica`, `GreetGuard`, redundant greeting stripping) into `services/conversation/greeting.ts` to encapsulate the conditions and allow unit tests for first-response handling. 【F:server/services/ConversationOrchestrator.ts†L308-L353】【F:server/services/ConversationOrchestrator.ts†L424-L437】

3. **Routing & heuristics module**
   - Create a `ConversationRouter` responsible for `isLowComplexity`, `heuristicaPreViva`, and deciding between fast-lane and full flow. This router can expose `route(messages, flags): "fast" | "full"` and be unit-tested with crafted message fixtures. 【F:server/services/ConversationOrchestrator.ts†L77-L217】【F:server/services/ConversationOrchestrator.ts†L358-L440】

4. **Parallel fetch service**
   - Extract `operacoesParalelas` and `withTimeoutOrNull` into `services/conversation/parallelFetch.ts` so the orchestrator merely invokes `await parallelFetch.run(params)`. Provide dependency injection for embedding lookup, heuristics service, and memory search to make mocks trivial. 【F:server/services/ConversationOrchestrator.ts†L92-L155】【F:server/services/ConversationOrchestrator.ts†L444-L517】

5. **Context assembly module**
   - Wrap `montarContextoOtimizado` logic in a `ContextCache` class that receives `PROMPT_CACHE` and `ContextBuilder`. This class could also compute the cache key and log timings, keeping orchestration logic focused on control flow. 【F:server/services/ConversationOrchestrator.ts†L158-L197】

6. **Response formatting & persistence**
   - Consolidate the repeated block that cleans/strips greetings, enriches with bloco técnico, triggers async persistence, and tracks analytics into a `ResponseFinalizer`. It can expose `finalize({ rawResponse, bloco, metadata })` and be reused by both fast and full routes. 【F:server/services/ConversationOrchestrator.ts†L262-L438】【F:server/services/ConversationOrchestrator.ts†L563-L654】

7. **Configuration & feature flags**
   - Group the various env-driven constants (`ECO_*`) into a config module so tests can override them via dependency injection instead of process-level state.

## Testing strategy

- **Pure helpers**: add Jest unit tests for `stripIdentityCorrection`, `stripRedundantGreeting`, `isLowComplexity`, and `heuristicaPreViva` with edge-case fixtures to lock behavior before refactoring. 【F:server/services/ConversationOrchestrator.ts†L53-L217】
- **Router tests**: once routing logic is extracted, cover scenarios for fast-lane vs full, greeting suppression, and forced overrides using synthetic message arrays.
- **Parallel fetch service**: inject fakes for embedding, heuristics, memories, and verify timeouts/fallbacks without hitting Supabase.
- **Context cache**: test cache hit/miss behavior by stubbing `ContextBuilder.build` and asserting caching rules when `memoriasSemelhantes` exist.
- **LLM clients**: wrap `claudeChatCompletion` behind an interface so tests can supply deterministic responses and exercise formatting/fallback paths for both fast and full pipelines.
- **Integration slice tests**: create high-level tests that feed prepared messages into the orchestrator with stubbed dependencies to ensure analytics/memory side-effects are invoked (or skipped) as expected.

## Isolation techniques

- Introduce a `ConversationDependencies` object that is passed into the orchestrator, bundling external services. This makes it easy to stub them in tests.
- Encapsulate background async fire-and-forget tasks (memory saving, analytics) inside a `PostProcessor` abstraction; in tests, expose hooks to await completion.
- Normalize data structures into typed value objects (e.g. `ConversationContext`, `UserSignals`) to avoid loose `any` usage and simplify validation.
- Consider moving feature toggles (e.g. greeting enablement) into a dedicated `FeatureFlags` service that can be toggled per test without mutating `process.env` globally.

Implementing these steps incrementally—starting with extracting pure helpers and response finalization—will reduce the risk of regressions while making the codebase more testable and maintainable.
