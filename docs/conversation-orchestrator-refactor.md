# Conversation Orchestrator Refactor Notes

## Current Responsibilities
- Builds final stream payload metadata (`buildFinalizedStreamText`, `buildStreamingMetaPayload`).
- Handles micro responses and greeting pipeline fallbacks.
- Coordinates routing, context loading, prompt building, and LLM execution (fast vs full modes).
- Manages streaming control flow, chunk emission, bloco pipeline, and memory persistence.
- Performs non-streaming fallback handling.

## Suggested Module Decomposition
1. **Response Post-Processing Module**
   - Move `buildFinalizedStreamText` and `buildStreamingMetaPayload` into a dedicated helper focused on response transformation and metadata extraction.
   - Extract `salvarMemoriaViaRPC` into a `MemoryPersistenceService` that can be reused by streaming and non-streaming flows.
2. **Entry Routing Pipeline**
   - Encapsulate the micro-response and greeting handling into a `PreLLMDecision` module returning either a prepared response or instructions to continue with the main pipeline.
3. **Context Preparation Service**
   - Create a module responsible for `loadConversationContext` invocation and `defaultContextCache.build` call, returning the computed system prompt and context artifacts.
4. **LLM Execution Orchestrators**
   - Split the streaming and non-streaming execution paths into separate orchestrators that accept injected dependencies (LLM client, response finalizer, event emitter) and return standardized results.
5. **Orchestrator Facade**
   - Keep `getEcoResponse` as a thin facade that wires the modules together, handles dependency injection, and chooses the path based on routing decisions.

## Testing Strategy
- **Unit Tests**
  - Validate metadata builders with focused tests for edge cases.
  - Mock Supabase client to assert that `MemoryPersistenceService` calls RPCs conditionally and handles errors.
  - Ensure routing module behavior using stubbed inputs to cover micro, greeting, fast, and full paths.
  - For context preparation, mock dependencies to verify prompt construction decisions.
- **Integration Tests**
  - Exercise streaming orchestrator with fake LLM stream to assert event emission ordering and bloco pipeline interactions.
  - Test non-streaming flow to ensure finalization and memory persistence interactions.

## Isolation Techniques
- Introduce dependency injection for external services (Supabase, LLM clients, response finalizer) to allow mocking.
- Use interfaces for event emitters and bloco handlers to decouple from concrete implementations.
- Provide factory functions to build orchestrators with default dependencies for production, but allow overrides during tests.
