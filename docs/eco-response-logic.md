# Lógica de Respostas da ECO

Este documento mapeia, explica e valida o fluxo de decisão da ECO desde a chegada da mensagem até a entrega da resposta. Abrange orquestração, seleção de módulos, matriz NV1/NV2/NV3, heurísticas, memórias, bloco técnico, transporte, identidades (usuário/guest) e orçamento de tokens.

## 1. Orquestração ponta a ponta

1. **Validação e atalhos** – `getEcoResponse` valida envs, acesso Supabase e estrutura de `messages`, executa atalhos de saudação/micro-reflexo antes de acionar o LLM. 【F:server/services/ConversationOrchestrator.ts†L50-L132】
2. **Decisão emocional** – A última fala alimenta `computeEcoDecision`, que calcula intensidade, abertura e flags e informa o `ActivationTracer` sobre persitência de memória. 【F:server/services/ConversationOrchestrator.ts†L134-L143】【F:server/services/conversation/ecoDecisionHub.ts†L17-L117】
3. **Roteamento** – O `defaultConversationRouter` escolhe modo (`fast`, `stream`, `full`) considerando decisão emocional, override e histórico. Fast-lane usa `runFastLaneLLM`; demais caminhos constroem prompt completo. 【F:server/services/ConversationOrchestrator.ts†L144-L187】
4. **Contexto** – `prepareConversationContext` agrega heurísticas, derivados, memórias e monta o `systemPrompt` via `ContextCache`/`ContextBuilder`. 【F:server/services/ConversationOrchestrator.ts†L189-L214】【F:server/services/conversation/contextPreparation.ts†L1-L72】【F:server/services/conversation/contextCache.ts†L8-L102】
5. **Execução** – `buildFullPrompt` une prompt de sistema e histórico; `executeStreamingLLM` ou `executeFullLLM` chamam o modelo principal e alimentam métricas. 【F:server/services/ConversationOrchestrator.ts†L215-L273】
6. **Finalização** – `defaultResponseFinalizer` higieniza texto, dispara bloco técnico, telemetria e persistência de memórias. 【F:server/services/ConversationOrchestrator.ts†L215-L273】【F:server/services/conversation/responseFinalizer.ts†L1-L220】

## 2. Seleção e carregamento de módulos de prompt

* **Seleção base** – `Selector.selecionarModulosBase` aplica matriz NV, gates de intensidade e regras condicionais (flags) para gerar listas brutas, pós-gating e priorizadas. 【F:server/services/promptContext/baseSelection.ts†L1-L104】
* **Catálogo** – `ModuleCatalog` garante índice de arquivos, lê front-matter (min/max intensidade, abertura, flags) e calcula tokens. 【F:server/services/promptContext/moduleCatalog.ts†L1-L113】
* **Metadados e dedupe** – `applyModuleMetadata` filtra candidatos pela decisão (DEC), aplica flags, dedupe por `dedupeKey` e separa rodapés (`inject_as`). 【F:server/services/promptContext/moduleMetadata.ts†L1-L120】
* **Costura** – `ContextBuilder` força `DEVELOPER_PROMPT` no topo, adiciona intents manuais, aplica reduções (`IDENTIDADE` removida) e costura blocos via `stitchModules` respeitando regras NV1. 【F:server/services/promptContext/ContextBuilder.ts†L113-L247】【F:server/services/promptContext/stitcher.ts†L1-L64】
* **Cache** – Prompts NV≤2 sem memórias são cacheados por chave `ctx:<userId>:<nivel>:…`, evitando reconstrução. 【F:server/services/conversation/contextCache.ts†L43-L102】

## 3. Matriz NV1/NV2/NV3 e níveis de abertura

* **Matriz** – `matrizPromptBaseV2` define módulos por nível, heranças, always-include, gates por intensidade e regras semânticas (crise, heurísticas, VIVA). 【F:server/services/promptContext/matrizPromptBaseV2.ts†L3-L206】
* **Nível automático** – `computeEcoDecision` converte intensidade/vulnerabilidade em `openness` (1–3) e sequência VIVA (`V`, `I`, `A`, `Pausa`). 【F:server/services/conversation/ecoDecisionHub.ts†L74-L108】
* **NV1** – Contexto simplificado: módulos core mini, instruções finais únicas, costura prioritária de `NV1_CORE` e `ANTISALDO_MIN`. 【F:server/services/promptContext/baseSelection.ts†L24-L57】【F:server/services/promptContext/stitcher.ts†L13-L34】【F:server/services/promptContext/instructionPolicy.ts†L13-L20】
* **NV2/NV3** – Herdam camadas `core`+`advanced`, recebem planos de resposta (espelho/coach) e bloco técnico quando `hasTechBlock`. 【F:server/services/promptContext/matrizPromptBaseV2.ts†L19-L85】【F:server/services/promptContext/instructionPolicy.ts†L21-L30】

## 4. Heurísticas, intensidade e tags

* **Flags lexicais** – `derivarFlags` marca pedidos práticos, crise, vulnerabilidade, vergonha, etc. Intensidade usa heurística de tamanho/palavras-gatilho. 【F:server/services/promptContext/flags.ts†L1-L118】
* **Heurísticas externas** – `mapHeuristicasToFlags` transforma resultados de embeddings em flags específicas (ancoragem, certeza emocional). 【F:server/services/promptContext/heuristicaFlags.ts†L1-L118】
* **Intenção extra** – `ContextBuilder` injeta módulos com base em intents explícitas (ex.: 🔄 revisitar memórias). 【F:server/services/promptContext/ContextBuilder.ts†L60-L111】
* **Debug DEC** – Cada decisão gera bloco `DEC` com intensidade, abertura, tags e flags para auditoria. 【F:server/services/promptContext/ContextBuilder.ts†L43-L58】【F:server/services/promptContext/ContextBuilder.ts†L166-L183】

## 5. Memórias e embeddings

* **Parallel fetch** – `ParallelFetchService.run` calcula embedding da última mensagem, busca heurísticas (top-4) e memórias (k=3, threshold 0.12). 【F:server/services/conversation/parallelFetch.ts†L1-L67】
* **Time-box** – `loadConversationContext` aplica timeouts configuráveis para derivados e paralelas, cacheia resultados por usuário e registra evidências no tracer. 【F:server/services/conversation/derivadosLoader.ts†L71-L220】
* **Bloco de memórias** – `formatMemRecall` sempre retorna seção `MEMORIAS_RELEVANTES`, limitando tokens por item e incluindo metadados (data, tags, similaridade). 【F:server/services/promptContext/memoryRecall.ts†L1-L98】
* **Persistência** – `ResponseFinalizer.persistirMemoriaEmBackground` só salva memórias quando há `userId` (não guest) e a decisão pede (`saveMemory`). 【F:server/services/conversation/responseFinalizer.ts†L214-L308】

## 6. Bloco técnico JSON

* **Geração** – `gerarBlocoTecnicoSeparado` força resposta em JSON via modelos técnicos com fallback e sanitiza campos permitidos. 【F:server/core/EmotionalAnalyzer.ts†L24-L169】
* **Garantias** – `ensureTechBlock` preenche defaults (emoção, tags, domínio, intensidade=DEC) e garante resumo alinhado à resposta limpa. 【F:server/services/conversation/responseFinalizer.ts†L76-L108】
* **Timeouts/telemetria** – `gerarBlocoComTimeout` limita espera, marca sucesso/falha/timeout em Mixpanel e recorre a reprocessamento background. 【F:server/services/conversation/responseFinalizer.ts†L130-L213】

## 7. Transporte (SSE x JSON)

* **Sessão stream** – `StreamSession` negocia SSE, envia eventos `prompt_ready`, `latency`, `chunk`, `done` e aplica heartbeat/timeout de 5 s com fallback amigável. 【F:server/routes/askEco/streaming.ts†L10-L155】
* **Fallback offline** – Quando `respondAsStream=false`, eventos são acumulados para envio único em JSON. 【F:server/routes/askEco/streaming.ts†L26-L95】
* **Tratamento de erro** – Eventos `error` desativam cache e encerram com `done` marcado como `fallback`. 【F:server/routes/askEco/streaming.ts†L178-L206】

## 8. Identidade: usuário autenticado vs guest

* **Supabase condicionado** – Orquestrador só instância Supabase e busca derivados quando não é guest e existe `accessToken`. 【F:server/services/ConversationOrchestrator.ts†L71-L103】
* **Cache de contexto** – `prepareConversationContext` zera `userId` efetivo para guests, evitando leitura/gravação de dados pessoais. 【F:server/services/conversation/contextPreparation.ts†L37-L48】
* **Persistência bloqueada** – `persistirMemoriaEmBackground` retorna cedo para guests, impedindo gravação de memórias ou analytics com `userId`. 【F:server/services/conversation/responseFinalizer.ts†L214-L257】
* **Identificadores** – Finalizador deriva `distinctId` de `guestId` quando presente, mantendo rastreio separado. 【F:server/services/conversation/responseFinalizer.ts†L238-L273】

## 9. Orçamento de tokens

* **Limites configuráveis** – `computeBudgetTokens` aplica clamp (800–6000) sobre env `ECO_CONTEXT_BUDGET_TOKENS`, padrão 2500. 【F:server/services/promptContext/budget.ts†L1-L61】
* **Planejamento** – `planBudget` chama `Budgeter.run` com lista ordenada, pesos absolutos e módulos fixos (`pinned`). Módulos excedentes recebem motivo `budget`. 【F:server/services/promptContext/budget.ts†L38-L61】【F:server/services/promptContext/ContextBuilder.ts†L231-L264】
* **Costura final** – `ContextBuilder` combina instruções, memórias, extras e mensagem atual garantindo cabeçalhos NV e políticas de memória. 【F:server/services/promptContext/ContextBuilder.ts†L265-L360】【F:server/services/promptContext/promptComposer.ts†L1-L44】

---

Com estes componentes validados, a ECO mantém coerência entre decisão emocional, seleção de conhecimento, transporte e governança de dados, garantindo respostas calibradas e auditáveis.
