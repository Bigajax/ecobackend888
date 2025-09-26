# Sugestões de evolução arquitetural e de testes

## Observações sobre o estado atual
- O arquivo `server/server.ts` concentra responsabilidades de carregamento de variáveis de ambiente, configuração do Express, registro de rotas e agendamento de jobs opcionais num único módulo, o que dificulta testes isolados e reuso de middlewares em outros contextos.【F:server/server.ts†L1-L213】
- O `ModuleStore` acumula lógica de descoberta de diretórios, indexação assíncrona, cache e leitura de módulos textuais, tornando-o um ponto crítico que merece isolamento extra e testes dedicados.【F:server/services/promptContext/ModuleStore.ts†L1-L200】
- As rotas de memória misturam autenticação, validações, formatação de payload, chamadas de IA (embeddings/tags) e persistência Supabase no mesmo arquivo, aumentando o acoplamento e dificultando cenários de teste end-to-end ou mocks finos.【F:server/routes/memoryRoutes.ts†L1-L180】
- O repositório não possui testes automatizados `.test`/`.spec`, indicando uma boa oportunidade para adicionar cobertura mínima de regressão antes de refatorações mais profundas.【1419c7†L1-L2】

## Possíveis divisões e módulos
1. **Infraestrutura do servidor**
   - Extrair um `createApp()` em `server/core/http/app.ts` que monte middlewares e rotas, permitindo instanciar o Express sem subir servidor (útil para testes e para rodar em serverless). O bootstrap (`server/server.ts`) ficaria apenas responsável por carregar envs, chamar `configureModuleStore` e iniciar o listener.【F:server/server.ts†L27-L213】
   - Mover a configuração de CORS, logger e normalização de query para middlewares nomeados (`server/core/http/middlewares/*`), reaproveitados entre APIs e facilitando testes unitários.

2. **Domínios funcionais**
   - Agrupar arquivos relacionados em pacotes por domínio (ex.: `server/domains/memory/{routes,controller,service,repository}.ts`). A rota chamaria o controller; o controller orquestra validação e chama o serviço; o serviço depende de interfaces (ex.: `MemoryRepository`, `EmbeddingProvider`). Isso permitiria substituir Supabase/IA por doubles em testes.【F:server/routes/memoryRoutes.ts†L83-L177】
   - Para o contexto de prompts, separar claramente: `ModuleCatalog` (descoberta/indexação de arquivos), `PromptAssembly` (seleção + orçamento) e `PromptPolicies` (regras de nível/overhead). Isso mantém `ModuleStore` mais enxuto e deixa `ContextBuilder` focado em combinar blocos, reduzindo o número de dependências por classe.【F:server/services/promptContext/ModuleStore.ts†L85-L183】【F:server/services/promptContext/ContextBuilder.ts†L100-L199】

3. **Adapters e integrações**
   - Isolar chamadas Supabase em adaptadores/repositórios específicos (`server/adapters/supabaseMemoryRepository.ts`) para evitar importações diretas do cliente em rotas e permitir testes com implementações in-memory.【F:server/routes/memoryRoutes.ts†L3-L177】
   - Encapsular serviços de IA (embeddings, tags) em interfaces e injetá-los via construtor ou container simples, permitindo rodar testes sem tocar APIs externas.

## Estratégias de testes
- **Unidade**: criar suites para utilitários determinísticos como `heuristicaNivelAbertura` (cobrir casos de saudações, textos longos e vulneráveis) e para `ModuleStore` (resolução de roots, cache, contagem de tokens). Esses testes são rápidos e garantem que regras textuais não quebrem com refactors.【F:server/utils/heuristicaNivelAbertura.ts†L3-L53】【F:server/services/promptContext/ModuleStore.ts†L85-L183】
- **Componentes/Serviços**: testar `ContextBuilder` usando fixtures de módulos em disco temporário ou mocks de `ModuleStore`, validando seleção de módulos e aplicação de orçamento sem precisar de integrações externas.【F:server/services/promptContext/ContextBuilder.ts†L100-L199】
- **Integração HTTP**: após extrair `createApp()`, usar `supertest` para validar fluxos principais (`/api/memorias/registrar`, `/api/prompt-preview`) com dependências substituídas por dummies (ex.: repositório em memória que captura inserts). Isso captura regressões de roteamento e middlewares com pouco custo.
- **Contratos com Supabase/IA**: definir testes de contrato ou harnesses manuais que possam ser executados contra ambientes sandbox, garantindo que schemas e payloads permaneçam compatíveis antes de deploys.

## Dicas para isolar funcionalidades
- Introduzir interfaces mínimas (`EmbeddingService`, `TagGenerator`, `MemoryRepository`) e passá-las como dependências explícitas evita importar singletons estáticos e facilita mocks.
- Utilizar fábricas para montar serviços com dependências default (ex.: `makeMemoryService({ repo, embedder, tagGenerator })`) separa wiring da lógica, permitindo substituir implementações em testes.
- Centralizar constantes e políticas (listas de módulos essenciais, mensagens padrão) em arquivos imutáveis sob `server/core/policies/` reduz duplicação e esclarece onde ajustar regras.
- Adotar `zod` ou `class-validator` para validar payloads em controllers, tornando as rotas mais magras e conferindo contratos auto-documentados.

Esses passos criam uma base incremental: primeiro extraia pontos de criação/configuração, depois module por domínio e, por fim, introduza testes que sirvam de rede de segurança para futuras iterações.
