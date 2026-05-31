# Arquitetura do Prompt da Eco — o que realmente entra no system prompt

> **TL;DR:** A maior parte do conteúdo de identidade/voz/política está em **TypeScript**
> (`server/core/promptIdentity.ts` e `server/services/promptContext/instructionPolicy.ts`),
> **não** nos `.txt` de `server/assets/modulos_core/`. Vários `.txt` parecem relevantes mas
> **nunca entram no prompt**. Antes de editar qualquer prompt, rode `npm run prompt:dump`.

## Como inspecionar o prompt montado

```bash
# Prompt completo para uma mensagem (decisão derivada naturalmente do texto)
npm run prompt:dump -- "estou triste de novo essa semana"

# Só a tabela de quais blocos-fonte entram
npm run prompt:dump -- "preciso organizar minhas tarefas" --summary

# Forçar um nível/intensidade (atenção: forçar pode divergir da seleção natural)
npm run prompt:dump -- "não aguento mais esse vazio" --nivel 3 --intensidade 8 --vuln

# Sem injetar memória de exemplo / simular guest
npm run prompt:dump -- "oi" --no-mem --guest
```

Script: `server/scripts/dumpPrompt.ts`. Imprime o prompt real e uma tabela
PRESENTE/ausente dos blocos-fonte conhecidos.

## O que REALMENTE entra no prompt (verificado em NV1/NV2/NV3)

| Fonte | Onde editar | Observação |
|---|---|---|
| **Identidade, voz, política de memória, segurança** | `server/core/promptIdentity.ts` (`ID_ECO_CORE`, `ECO_MOVEMENT`, `ECO_VOICE`, `MEMORY_PROTOCOL`, `SAFETY_PROTOCOL`) | **Sempre presente.** Lever principal de tom/comportamento. |
| **Camada de "planos de instrução"** | `server/services/promptContext/instructionPolicy.ts` | **Presente.** Reescrita para tom natural/humano (antes empurrava misticismo: "Postura contemplativa", "Arqueológica/Apofática", "desenhar essa sensação..."). Mantém a função: refletir antes de aconselhar, máx. 1 pergunta, hipóteses como sugestão, segurança. |
| **Missão/restrições** | `server/assets/modulos_core/developer_prompt.txt` | Presente (forçado em primeiro via `ensureDeveloperPromptFirst`). |
| **Método VIVA** | `server/assets/modulos_extras/metodo_viva_enxuto.txt` | Presente. |
| **Bloco "MEMÓRIAS PERTINENTES" + instrução de uso** | `server/services/promptContext/composition/contextSectionsBuilder.ts` | Presente quando há memórias recuperadas; injetado no topo. |

## O que NÃO entra (módulos mortos — NÃO edite esperando efeito)

- `modulos_core/sistema_identidade.txt` — **dropado explicitamente** em `stitcher.ts` (DROP set).
- `modulos_core/formato_resposta.txt` — não sobrevive ao orçamento/knapsack em nenhum cenário testado.
- `modulos_core/usomemorias.txt` — não selecionado.
- `modulos_core/instrucoes_sistema.txt` — não selecionado (conteúdo coberto por `promptIdentity.ts`).
- `modulos_core/nv2_reflexao_core.txt`, `nv3_profundo_core.txt` — não selecionados.
- ~~`modulos_emocionais/eco_memoria_continuidade.txt`~~ — era órfão (dependia de `when.requiresMemories`, flag nunca avaliada); **removido** (não tinha nenhuma referência de código/config).

> Os demais `.txt` mortos acima **não foram deletados**: `sistema_identidade.txt`,
> `formato_resposta.txt` e `usomemorias.txt` estão em `server.ts › REQUIRED_MODULE_PATHS`
> (boot **fatal** se ausentes), além de `active-modules.json`, manifestos buildados,
> `baseSelection`/`matrizPromptBaseV2` e testes. Deletá-los exige editar esse gate + limpar
> todas as refs + **teste de boot real**. Ficam documentados como mortos até esse follow-up.

> A política de memória/identidade está duplicada entre esses `.txt` e o `promptIdentity.ts`,
> com risco de instruções conflitantes. O `.ts` é o que vale.

## Referências mortas no código (já limpas)

- `MEMORIA_COSTURA_REGRAS.txt` e `SINTETIZADOR_PADRAO.txt` eram empurrados como footers em
  `selection/moduleSelector.ts`, mas os arquivos não existem. Removidos.

## Onde editar para cada objetivo

- **Tom/voz (mais natural, menos místico):** `promptIdentity.ts` (`ECO_VOICE`) **e** `instructionPolicy.ts` (a camada contemplativa é o maior ofensor de misticismo ainda vivo).
- **Uso de memória / continuidade:** `promptIdentity.ts` (`ID_ECO_CORE`, `MEMORY_PROTOCOL`) e o bloco em `contextSectionsBuilder.ts`.
- **Restrições/missão:** `developer_prompt.txt`.
- **Segurança/crise:** `promptIdentity.ts` (`SAFETY_PROTOCOL`) — fonte canônica e presente.

## Testes (estado e higiene)

O diretório `tests/` **mistura dois frameworks**, o que esconde cobertura:

- `tests/quality/**`, `tests/bandits/**`, `tests/orchestrator/**` → **jest** (rodam via `npx jest` / `jest.config.ts`).
- `server/**/*.test.ts` → rodam via `jest.contract.config.ts` (`npm run test:contract`); muitos usam `node:test` e não rodam sob o jest raiz.
- Vários `tests/*.test.ts` na raiz (`contextCache`, `prepareQueryEmbedding`, `relatorioEmocionalRoutes`, `openrouterRoutesCache`) usam **node:test/harness próprio** → **não rodam por nenhum runner de CI hoje** (dead-weight).
- `tests/intensity-detection.test.ts` é jest legítimo mas **nunca estava no `testMatch`** e, ao rodar, **falha**: intensidade retorna 6 onde espera ≥7 (ex.: "Estou muito triste hoje"). Como `MEMORY_THRESHOLD = 7`, isso sugere que memórias que deveriam salvar talvez não estejam salvando — **investigar junto da calibração de intensidade**.
- `tests/orchestrator/heuristicsV2.test.ts › cooldown` está **quarentenado (`it.skip`)**: `planFamilyModules` retorna zero famílias no setup de teste (wiring bandit/manifesto), não é a lógica de cooldown.

### Como rodar (atualizado)

- `npm test` → **jest** (tests/{quality,bandits,orchestrator}).
- `npm run test:node` → **runner nativo node:test** sobre `server/tests/**` (os ~36 arquivos
  node:test agora rodam por aqui: `node -r ts-node/register --test`). Suítes de integração
  (rotas, SSE, analytics, supabase) precisam de env real (`SUPABASE_*`, `OPENROUTER_API_KEY`);
  sem env, elas falham/pulam — esperado fora de CI com chaves.

**Convenção:** `tests/{quality,bandits,orchestrator}` = jest; `server/tests/**` = node:test.
O `intensity-detection.test.ts` (jest, raiz) tem 1 caso ainda abaixo do esperado por design
(hesitação/"pesado" sem palavra de emoção explícita — evita falso-positivo em "pesado" literal);
os demais 12 casos foram calibrados e passam.

**Follow-up:** isolar as suítes de integração de dependências externas (mocks) para `test:node`
ficar verde sem chaves, e então encadear `npm test && npm run test:node` num único comando de CI.

## Prompt caching (LLM)

`server/core/ClaudeAdapter.ts` agora tem suporte a prompt caching via `cache_control`
(OpenRouter/Anthropic), **gated por `ECO_PROMPT_CACHE`** (off por padrão → comportamento
idêntico ao anterior). Helper: `buildSystemMessages()`.

**Pré-requisito para o cache funcionar (cache hit):** o cache da Anthropic é por **prefixo**.
Hoje o prompt montado coloca conteúdo **dinâmico** no início (bloco `MEMÓRIAS PERTINENTES`,
`DEC`, nome do usuário) e a identidade **estática** (`promptIdentity.ts`) no fim. Logo, ligar
`ECO_PROMPT_CACHE=1` sem mudar nada **não gera hit** (o prefixo muda a cada request).

**Para destravar o ganho** (input ~90% mais barato no trecho cacheado + menor TTFT), escolher
uma destas (follow-up, idealmente verificado com a API real):
1. **Reordenar** o prompt: identidade/instruções estáticas primeiro (prefixo cacheável),
   memória + mensagem atual no fim (também alta saliência por recência). Muda o "memória no
   topo" — decisão de design.
2. **Dividir** o system em dois blocos: um estático compartilhado (cacheado entre todos os
   usuários) + um dinâmico por request.

## Recomendações de consolidação (follow-up, requer revisão)

1. **Decidir fonte única por tema** e deletar/religar os `.txt` mortos (cuidado: muitos são
   referenciados por nome em `active-modules.json`, `baseSelection.ts`, `matrizPromptBaseV2.ts`
   e há checagem de módulos obrigatórios no boot — deletar exige limpar as referências).
2. ~~Reduzir a camada contemplativa em `instructionPolicy.ts`~~ — **feito**: bodies reescritos para tom natural (mantendo a função).
3. **Cortar redundância** entre `promptIdentity.ts`, `developer_prompt.txt` e os planos de
   instrução — o prompt monta ~5–6k tokens por turno.
