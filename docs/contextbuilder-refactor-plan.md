# ContextBuilder Refactor Notes

## Pain Points Observed
- `montarContextoEco` mixes dependency wiring (module indexing, reading, token counting) with orchestration and formatting, making the function very long and difficult to test in isolation.
- Logic related to module selection, budgeting, prompt stitching, and overhead instructions all live in the same function, which forces integration-style tests even for small rules.
- Module access happens through the concrete `ModuleStore` singleton and `Budgeter` static helpers, preventing focused unit tests without touching disk or large fixtures.

References: [`ContextBuilder.ts`](../server/services/promptContext/ContextBuilder.ts).

## Suggested Decomposition
1. **Module Index Readiness** – Extract `ensureModuleIndexReady` and `requireModule` into a `ModuleCatalog` service that is responsible only for bootstrapping and reading modules (with configurable missing-module policy). This enables testing catalog behaviour separately from prompt assembly.
2. **Module Selection Pipeline** – Convert the selector + gating pipeline into a pure function, e.g. `selectCandidateModules(input): ModuleSelection`, which receives dependencies (`Selector`, `derivarNivel`, `detectarSaudacaoBreve`) by parameter. Tests can then cover edge cases around salutations and level derivation without budget logic.
3. **Budget Planner** – Wrap the `Budgeter.run` call in a `BudgetPlanner` module that takes token counts and returns `{ used, cut }`. Inject this planner so tests can supply deterministic outcomes or simulate budget pressure.
4. **Prompt Stitcher** – Move `stitchNV1`, `stitchNV`, `dedupeBySection`, and `titleFromName` into a `PromptStitcher` utility. Provide a small interface (`stitch(level, modules)`) for the builder. Each stitcher rule can then be unit-tested using string fixtures.
5. **Instruction/Overhead Policy** – Encapsulate overhead string assembly in an `InstructionPolicy` object keyed by level. Tests can verify that NV1 only gets the final instructions while higher levels add the response plan.
6. **PromptComposer** – Assemble header, extras, memory recall, and final prompt string in a dedicated composer class that accepts structured inputs and returns the formatted prompt. This keeps `ContextBuilder.build` focused on orchestrating collaborators.

## Testing Strategy
- **Unit Tests**: With the collaborators injected, write unit tests for each component (selector, catalog, budget planner, stitcher, instruction policy). Use Jest to stub dependencies such as `ModuleStore` and supply fixtures in memory.
- **Integration Test**: Keep a single integration test that wires the real components together using a temporary directory of module files. This ensures the orchestrated flow still works end-to-end.
- **Snapshot Tests**: For the `PromptComposer`, snapshot the final prompt output for representative inputs (NV1 greeting, NV3 deep conversation, memory recall present) so regressions in formatting are easy to catch.
- **Property-Based Checks**: Consider quick-check style tests ensuring deduplication never drops unique sections and that budget planner results never exceed the requested budget.

## Isolation Tactics
- Pass dependencies (`ModuleCatalog`, `BudgetPlanner`, `InstructionPolicy`, `PromptComposer`) into the builder via constructor or factory. Export a default factory that wires the real implementations so existing call sites stay unchanged.
- Use TypeScript interfaces for each collaborator to keep the builder decoupled from concrete singletons and facilitate mocking.
- Keep helper functions (`hash`, `limparEspacos`, identity extraction) in separate utility files with targeted tests so changes do not require editing the orchestrator.

## Incremental Rollout
1. Introduce the new interfaces and adapt `ContextBuilder.build` to receive dependencies while keeping the existing static export as a wrapper.
2. Move stitching and identity helpers into their own module and add tests for them.
3. Extract the budget planning wrapper and add Jest tests covering normal, under-budget, and over-budget cases.
4. Refactor module loading into the catalog service and add tests for strict vs relaxed missing-module policies.
5. Finally, split `montarContextoEco` into orchestrated steps calling the new collaborators, reducing its size and making it easy to cover each branch.

Following these steps should make `ContextBuilder` easier to understand, extend, and verify without large integration suites.
