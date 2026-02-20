# Sistema de Montagem de Contexto e Níveis de Abertura da IA Eco

## 1. Resumo geral
O sistema de orquestração da Eco transforma a última mensagem do usuário em uma resposta personalizada com memória persistente. A cadeia principal percorre:

```
input → getEcoResponse → prepareConversationContext / ContextCache → ContextBuilder.montarContextoEco → LLM (ecoCortex/OpenRouter) → bloco técnico → Supabase
```

1. **Input** chega via `getEcoResponse`, que valida a requisição, executa atalhos pré-LLM e calcula a decisão emocional (`computeEcoDecision`).【F:server/services/ConversationOrchestrator.ts†L169-L239】【F:server/services/conversation/ecoDecisionHub.ts†L119-L155】
2. **Montagem de contexto** acontece em `prepareConversationContext`, que busca memórias, heurísticas e continuidade antes de delegar para o cache/`ContextBuilder.montarContextoEco` gerar o prompt dinâmico.【F:server/services/ConversationOrchestrator.ts†L326-L381】【F:server/services/conversation/contextPreparation.ts†L34-L139】
3. **Execução do LLM** usa o prompt retornado pelo builder, chama o modelo principal configurado (OpenRouter/Claude) e coleta metadados para telemetria.【F:server/services/ConversationOrchestrator.ts†L329-L375】【F:server/services/ConversationOrchestrator.ts†L595-L668】
4. **Pós-processamento** (`ResponseFinalizer`) normaliza a resposta, gera o bloco técnico quando aplicável e aciona a persistência no Supabase.【F:server/services/conversation/responseFinalizer.ts†L624-L895】【F:server/services/conversation/responseFinalizer.ts†L525-L595】

## 2. Pipeline de orquestração
### Recepção do input
- A rota `POST /ask-eco` chama `getEcoResponse` com histórico, metadados de sessão e credenciais.【F:server/routes/promptRoutes.ts†L889-L952】
- `runPreLLMPipeline` aplica atalhos (saudação, respostas rápidas) antes de seguir para o fluxo completo.【F:server/services/ConversationOrchestrator.ts†L169-L239】

### Análise emocional
- `computeEcoDecision` estima intensidade (0–10), detecta vulnerabilidade lexical/heurística e deriva o nível de abertura (1, 2, 3). Intensidade ≥7 força `saveMemory` e `hasTechBlock` verdadeiros.【F:server/services/conversation/ecoDecisionHub.ts†L56-L155】
- `applyMemoryDecision` garante que apenas usuários autenticados (não guest) disparem memória técnica e registra o racional no `ActivationTracer`.【F:server/services/ConversationOrchestrator.ts†L242-L261】

### Preparação de contexto
- `prepareConversationContext` chama `loadConversationContext`, que em paralelo gera embedding da mensagem, busca heurísticas e memórias semânticas (`buscarMemoriasComModo`) e calcula continuidade.【F:server/services/conversation/contextPreparation.ts†L34-L139】【F:server/services/conversation/derivadosLoader.ts†L89-L316】
- Flags derivadas (como `useMemories`, `patternSynthesis` e referências de continuidade) são anexadas ao objeto `decision` e ao contexto retornado.【F:server/services/conversation/contextPreparation.ts†L63-L137】

### Cache e builder
- `defaultContextCache.build` tenta reutilizar prompts baseados em chave `ctx:<id>:<nivel>:...`; se não houver hit, chama `ContextBuilder.montarContextoEco`. O cache só grava quando não há memórias similares e `nivel ≤ 2`.【F:server/services/conversation/contextCache.ts†L49-L129】
- `ContextBuilder.montarContextoEco` calcula uma decisão local (quando não fornecida), processa heurísticas, tags e domínios e passa por `executeModulePipeline`, que seleciona módulos conforme regra/budget. O resultado injeta instruções, seções de memória, identidade e blocos DEC.【F:server/services/promptContext/ContextBuilder.ts†L36-L232】

### Execução do modelo
- Após montar `systemPrompt`, `buildFullPrompt` converte para o formato esperado pelo modelo e `runFastLaneLLM` ou `runFullPath` executam a chamada no provedor principal (`anthropic/claude-3-5-sonnet` por padrão).【F:server/services/ConversationOrchestrator.ts†L329-L381】【F:server/services/ConversationOrchestrator.ts†L595-L668】

### Finalização e armazenamento
- `ResponseFinalizer.finalize` higieniza texto, decide geração do bloco técnico, registra telemetria, avalia ancoragem de memórias e inicia persistência em background (`persistirMemoriaEmBackground`).【F:server/services/conversation/responseFinalizer.ts†L624-L895】【F:server/services/conversation/responseFinalizer.ts†L438-L595】

## 3. Níveis de abertura emocional
- **Derivação:** `deriveOpenness` mapeia intensidade e sinal de vulnerabilidade: intensidade ≥7 com vulnerabilidade → nível 3; intensidade ≥5 → nível 2; caso contrário nível 1.【F:server/services/conversation/ecoDecisionHub.ts†L102-L117】
- **Uso no pipeline:**
  - `ContextBuilder` recebe `ecoDecision.openness` para escolher instruções (`buildInstructionBlocks`), decidir VIVA e montar seções extras.【F:server/services/promptContext/ContextBuilder.ts†L161-L191】
  - `ModulePipeline` considera `nivel` ao ativar módulos e heurísticas.【F:server/services/promptContext/ContextBuilder.ts†L123-L137】
  - `defaultContextCache` inclui o nível na chave de cache e controla reutilização.【F:server/services/conversation/contextCache.ts†L53-L129】

### Influência por nível
- **Nível 1 – Superfície**: Seleciona `nv1_core.txt`, `identidade_mini.txt`, `ANTISALDO_MIN.txt` e `escala_abertura_1a3.txt`, além de herdar módulos base essenciais (developer prompt, identidade, princípios). Respostas são objetivas e sem bloco técnico.【F:server/services/promptContext/baseSelection.ts†L27-L58】【F:server/services/promptContext/matrizPromptBaseV2.ts†L6-L51】
- **Nível 2 – Reflexão**: Herda camadas `core` e `advanced`, ativando módulos filosóficos e heurísticos quando regras se cumprem (`nivel>=2`). Exemplos: `eco_observador_presente.txt`, `eco_corpo_emocao.txt`, `eco_heuristica_disponibilidade.txt`. Tom mais empático e introspectivo.【F:server/services/promptContext/matrizPromptBaseV2.ts†L40-L198】
- **Nível 3 – Profundidade**: Mantém módulos do nível 2, adiciona heurísticas de crise, continuidade e garante bloco técnico (`DEC.hasTechBlock`). Intensidade alta e vulnerabilidade exigem narrativa sensível e bloco JSON anexado.【F:server/services/conversation/ecoDecisionHub.ts†L128-L137】【F:server/services/promptContext/matrizPromptBaseV2.ts†L87-L101】

## 4. Montagem do contexto
### Ordem de composição (efetiva)
`assemblePrompt` constrói o prompt concatenando blocos estáticos, identitários e seções dinâmicas. A ordem observada é:
1. **Base programável** (`developer_prompt.txt`, `IDENTIDADE.txt`, princípios) via matriz base.【F:server/services/promptContext/matrizPromptBaseV2.ts†L6-L51】
2. **Personalidade** e módulos nucleares (ex.: `eco_estrutura_de_resposta.txt`, `MODULACAO_TOM_REGISTRO.txt`).【F:server/services/promptContext/matrizPromptBaseV2.ts†L6-L78】
3. **Instruções comportamentais** (`nv1_core.txt`, `ANTISALDO_MIN.txt` etc. conforme nível).【F:server/services/promptContext/baseSelection.ts†L27-L98】
4. **Módulos filosóficos/heurísticos/estoicos** adicionados pelo pipeline quando regras disparam (`nivel>=2`, flags semânticas, heurísticas cognitivas, detecção de crise).【F:server/services/promptContext/matrizPromptBaseV2.ts†L113-L198】
5. **Footers dinâmicos** (p.ex. encerramento sensível) oriundos de `budgetResult.finalFooters`.【F:server/services/promptContext/ContextBuilder.ts†L154-L158】
6. **Memórias relevantes** formatadas por `buildContextSections`, incluindo memórias semelhantes e derivados quando presentes.【F:server/services/promptContext/ContextBuilder.ts†L165-L189】
7. **Perfil emocional / abertura híbrida** inserido a partir de `derivados` e `aberturaHibrida` carregados no contexto.【F:server/services/promptContext/ContextBuilder.ts†L166-L174】【F:server/services/conversation/derivadosLoader.ts†L283-L305】

### Leitura dos arquivos TXT
- `ModuleCatalog.ensureReady()` indexa o diretório `server/assets` e disponibiliza os textos para composição; módulos selecionados são concatenados respeitando prioridade e orçamento antes de aplicar a mensagem atual (`applyCurrentMessage`).【F:server/services/promptContext/ContextBuilder.ts†L88-L233】

### Memórias e embeddings
- `parallelFetchService.run` gera embedding da entrada, consulta heurísticas (`buscarHeuristicasSemelhantes`) e memórias (`buscarMemoriasComModo`). Resultados alimentam `ContextBuilder` e `ActivationTracer` com evidências de similaridade.【F:server/services/conversation/parallelFetch.ts†L31-L127】【F:server/services/conversation/parallelFetch.ts†L200-L315】
- A continuidade é decidida por `decideContinuity`, que verifica similaridade temporal e registra referência para reforçar prompt e telemetria.【F:server/services/conversation/derivadosLoader.ts†L252-L316】

## 5. Bloco técnico JSON
- **Condição:** `ecoDecision.hasTechBlock` só é verdadeiro quando `computeEcoDecision` decide salvar memória (intensidade ≥7). Níveis inferiores não geram bloco técnico automaticamente.【F:server/services/conversation/ecoDecisionHub.ts†L128-L137】
- **Geração:** `ResponseFinalizer` chama `gerarBlocoComTimeout`, normaliza campos via `ensureTechBlock` e anexa ao texto final (modo fast aguarda em paralelo, modo full espera o bloco). Campos obrigatórios são preenchidos ou normalizados (`emocao_principal`, `intensidade`, `tags`, `dominio_vida`, `nivel_abertura`, `analise_resumo`, `salvar_memoria`).【F:server/services/conversation/responseFinalizer.ts†L354-L435】【F:server/services/conversation/responseFinalizer.ts†L275-L307】【F:server/services/conversation/responseFinalizer.ts†L688-L744】
- **Persistência:** `persistirMemoriaEmBackground` aguarda o bloco (ou regenera) e chama `saveMemoryOrReference`, que decide entre `memories` (quando intensidade ≥7) ou `referencias_temporarias` (quando 1–6). Atualiza a tabela `mensagem` com `salvar_memoria` e sentimento, além de vincular memórias contínuas via RPC `vincular_memorias` quando aplicável.【F:server/services/conversation/responseFinalizer.ts†L438-L595】【F:server/services/MemoryService.ts†L177-L280】

## 6. Integração com Supabase
### Escrita de memórias
- `saveMemoryOrReference` insere na tabela `memories` quando `shouldSaveMemory` (intensidade ≥7 e `decision.saveMemory`). Caso contrário, grava referência temporária com `salvar_memoria=false` em `referencias_temporarias` via `salvarReferenciaTemporaria`. Ambas incluem embedding, tags, domínio de vida e vínculo com mensagem anterior.【F:server/services/MemoryService.ts†L208-L279】【F:server/services/referenciasService.ts†L62-L127】
- Após inserir memória, o sistema atualiza o perfil emocional (`updateEmotionalProfile`), invalida caches e registra eventos Mixpanel (memória registrada, pergunta profunda).【F:server/services/MemoryService.ts†L247-L280】

### Busca de memórias
- Durante o contexto, `buscarMemoriasComModo` usa embeddings normalizados para chamar a função RPC `buscar_memorias_semanticas_v2` através do cliente Supabase. O modo (`FAST` ou `DEEP`) define top-k e filtros (memória atual, auth UID).【F:server/services/supabase/memoriaRepository.ts†L17-L49】
- `ecoCortex` também expõe um caminho administrativo para recuperar memórias com configurações de limite, limiar e MMR específicos por modo, registrando telemetria Mixpanel.【F:src/core/ecoCortex.ts†L9-L58】

### Atualização de mensagens e analytics
- `ResponseFinalizer` escreve `salvar_memoria` e sentimento na tabela `mensagem`, registra interação/latência (`analytics`) e vincula memórias sequenciais via RPC. Metadados incluem combinações de módulos, tokens e sinais heurísticos para análises posteriores.【F:server/services/conversation/responseFinalizer.ts†L525-L895】

## 7. Diagrama visual
```mermaid
graph TD
  A[Input do usuário] --> B[getEcoResponse]
  B --> C[computeEcoDecision<br/>nivel_abertura & intensidade]
  C --> D[prepareConversationContext]
  D -->|memórias & heurísticas| E[ContextCache / montarContextoEco]
  E --> F[Prompt dinâmico]
  F --> G[ecoCortex / LLM principal]
  G --> H[ResponseFinalizer]
  H --> I[Bloco técnico JSON]
  I -->|intensidade ≥7| J[memories (Supabase)]
  I -->|intensidade <7| K[referencias_temporarias]
  H --> L[Analytics & telemetria]
```

## 8. Sumário final
### Principais insights
- A decisão emocional (`computeEcoDecision`) centraliza intensidade, nível de abertura, passos VIVA e persistência de memória, orientando tanto o builder quanto o finalizador.【F:server/services/conversation/ecoDecisionHub.ts†L119-L137】
- O contexto reutiliza prompts via cache parametrizado por nível, intensidade e presença de memórias, reduzindo latência sem perder personalização.【F:server/services/conversation/contextCache.ts†L49-L129】
- Módulos TXT são ativados por regras declarativas em `matrizPromptBaseV2`, permitindo combinação dinâmica por intensidade, heurísticas e flags semânticas.【F:server/services/promptContext/matrizPromptBaseV2.ts†L58-L206】
- A persistência diferencia memórias profundas (intensidade ≥7) de referências leves, mantendo histórico rico sem sobrecarregar o banco.【F:server/services/MemoryService.ts†L208-L280】【F:server/services/referenciasService.ts†L62-L127】

### Lacunas ou inconsistências
- Não há módulos adicionais específicos para nível 3 além dos herdados; `matrizPromptBaseV2` trata níveis 2 e 3 de forma idêntica na herança, confiando em regras de intensidade/flags para especializar (potencial expansão futura).【F:server/services/promptContext/matrizPromptBaseV2.ts†L40-L198】
- `intensidadeMinima` na matriz está vazio, delegando todo controle ao DEC; se novas regras de gating forem necessárias, a estrutura já suporta mas está inativa.【F:server/services/promptContext/matrizPromptBaseV2.ts†L52-L57】

### Sugestões de melhoria
- Registrar explicitamente no contexto quais módulos foram ativados por nível (ex.: tags no prompt) facilitaria depuração sem depender apenas de logs debug.【F:server/services/promptContext/ContextBuilder.ts†L199-L229】
- Expor resumo do bloco técnico na resposta metadata (além de `response.meta`) para facilitar auditorias externas sem reprocessar logs.【F:server/services/conversation/responseFinalizer.ts†L624-L895】
