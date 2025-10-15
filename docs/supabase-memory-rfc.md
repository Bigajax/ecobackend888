# RFC: Supabase Semantic Memory Architecture for ECO

## Contexto e motivação

A ECO já persiste memórias e referências por meio de chamadas diretas ao Supabase, mas
faltava uma visão consolidada das responsabilidades do banco, do esquema definitivo e
dos artefatos (índices, RLS, RPCs, telemetria e testes) que sustentam a memória
emocional. Esta RFC documenta o modelo alvo e entrega os scripts necessários para
alinhar o ambiente do Supabase com a arquitetura de memória semântica.

## Objetivos

1. Formalizar a camada de dados para memórias (intensidade ≥ 7) e referências
   temporárias (< 7).
2. Normalizar índices vetoriais (HNSW/cosine) e auxiliares por usuário/data.
3. Endurecer RLS com escopo por `usuario_id` e exceção service-role.
4. Disponibilizar RPC de busca semântica com score composto, MMR e budget de tokens.
5. Incluir helpers de diversidade/token, telemetria registrável pelo backend e scripts
   de observabilidade.
6. Fornecer testes pgTAP que façam smoke das funções com dados seed.
7. Definir plano de migração, critérios de aceite e rollback seguro.

## Responsabilidade do Supabase

- **Persistência primária** das memórias intensas (`memories`) e referências temporárias
  (`referencias_temporarias`).
- **Persistência de embeddings** (semântico e emocional), tags, domínio de vida,
  emoção, intensidade, pin, timestamps e ligações com mensagens anteriores.
- **Indexação** vetorial (HNSW/cosine) e auxiliares por usuário, tags e datas.
- **Enforcement de RLS** garantindo isolamento por usuário e acesso irrestrito somente
  para service-role.
- **Execução do RPC `buscar_memorias_semanticas`** com score composto, MMR e limite de
  tokens.
- **Geração de telemetria** via `telemetry.memory_event_log` para consumo posterior em
  Mixpanel.
- **Disponibilização de observabilidade** (EXPLAIN/ANALYZE) e testes automatizados
  executáveis em pipelines (pgTAP).

## Artefatos entregues

| Área | Artefato | Caminho |
|------|----------|---------|
| Esquema | Tabelas, índices, RLS, gatilhos | `supabase/schema/memory_schema.sql` |
| RPC | Busca semântica com MMR/budget | `supabase/functions/buscar_memorias_semanticas.sql` |
| Helpers | Tokens & MMR utilitário | `supabase/functions/token_helpers.sql` |
| Telemetria | Log de eventos + função | `supabase/telemetry/memory_event_log.sql` |
| Observabilidade | Script de EXPLAIN/ANALYZE | `supabase/observability/explain_buscar_memorias_semanticas.sql` |
| Testes | Smoke pgTAP para RPC | `supabase/tests/memory_semantic_retrieval.sql` |

## Modelo de dados

- **`public.memories`** – memórias persistentes (intensidade ≥ 7). Campos obrigatórios:
  `usuario_id`, `texto`, `intensidade`, `tags`, `embedding`, `created_at`. Campos
  complementares cobrem emoção, domínio de vida, pin, resumo, `mensagem_id` e
  `referencia_anterior_id`. `token_count` é gerado automaticamente para o budget de
  resposta. Índices HNSW para `embedding` e `embedding_emocional` com cosine, além de
  índices por usuário/data e tags.【F:supabase/schema/memory_schema.sql†L6-L108】
- **`public.referencias_temporarias`** – referências transitórias (< 7), com os mesmos
  campos das memórias e coluna `expires_at` para limpezas periódicas.【F:supabase/schema/memory_schema.sql†L46-L91】
- **`telemetry.memory_event_log`** – tabela para registrar eventos (Mixpanel/log) com
  índices por usuário e status.【F:supabase/telemetry/memory_event_log.sql†L1-L34】

### Regras e integridade

- `intensidade` limitada a 0–10 (CHECK).
- `pin` controla fixação manual; `salvar_memoria` diferencia memórias (true) de
  referências (false).
- `token_count` gerado via coluna computada (`ceil(length(texto)/4)`).
- Gatilho `touch_updated_at` mantém `updated_at` consistente.【F:supabase/schema/memory_schema.sql†L93-L118】

## Índices vetoriais e auxiliares

- **HNSW cosine** em `embedding` e `embedding_emocional` (m=16, ef_construction=64) para
  memórias e referências.【F:supabase/schema/memory_schema.sql†L119-L140】
- **GIN** para tags, **btree** composto para `(usuario_id, created_at desc)` agilizando
  filtros por usuário e recência.【F:supabase/schema/memory_schema.sql†L111-L118】

## RLS

- RLS habilitada em ambas as tabelas; políticas `select/insert/update` restringem ao
  `auth.uid()` do JWT corrente.
- Política adicional `service_role` libera qualquer operação quando `auth.role()` for
  `service_role`, permitindo uso seguro via chave de serviço no backend.【F:supabase/schema/memory_schema.sql†L142-L166】

## RPC de retrieve semântico

`public.buscar_memorias_semanticas` recebe usuário, embeddings, filtros (tags, emoção),
opções de incluir referências e parâmetros de afinamento (limit, token budget, lambda
MMR, half-life de recência, pin boost). Implementação:

1. Valida JWT x `usuario_id` (ou permite service-role).
2. Constrói `candidate_pool` com memórias e referências do usuário (limit 60).
3. Calcula sub-scores: similaridade semântica, similaridade emocional (quando houver
   embedding), recência (decay exponencial), overlap de tags, match de emoção e boost
   de pin.
4. Gera `composite_score` ponderado.
5. Itera candidatos em ordem desc, aplicando budget de tokens e penalidade de MMR via
   similaridade máxima com itens já selecionados.
6. Retorna itens ordenados por `effective_score` (pós-MMR).【F:supabase/functions/buscar_memorias_semanticas.sql†L1-L220】

### Helpers

Funções utilitárias expõem cálculo aproximado de tokens, budget residual e MMR bruto
para reuso em outras rotinas SQL/RPCs.【F:supabase/functions/token_helpers.sql†L1-L31】

## Telemetria

`telemetry.log_memory_event` (security definer) registra eventos ligados à memória com
metadados (payload/contexto). Política interna valida `usuario_id` contra JWT salvo em
`request.jwt.claim.*` para evitar spoofing quando não for service-role.【F:supabase/telemetry/memory_event_log.sql†L13-L30】

## Testes

`supabase/tests/memory_semantic_retrieval.sql` usa pgTAP para:

- Provisionar schemas mínimos (`auth.users`).
- Popular memória e referência seed.
- Executar o RPC e validar retorno (>0 linhas, score positivo) e integridade de token
  count.【F:supabase/tests/memory_semantic_retrieval.sql†L1-L86】

Execute com `pg_prove supabase/tests/memory_semantic_retrieval.sql` ou via CI.

## Observabilidade

Script `supabase/observability/explain_buscar_memorias_semanticas.sql` roda
`EXPLAIN (ANALYZE, BUFFERS)` sobre o RPC com parâmetros exemplares, facilitando
investigação de latência ou tuning de índices.【F:supabase/observability/explain_buscar_memorias_semanticas.sql†L1-L16】

## Plano de migração

1. **Preparação (pré-deploy)**
   - Executar `memory_schema.sql` em ambiente de staging.
   - Validar `pg_trgm`, `vector` e `uuid-ossp` habilitados.
   - Carregar `token_helpers.sql`, `memory_event_log.sql` e demais funções.
   - Popular dados seed e rodar testes `pgTAP`.
2. **Deploy produção**
   - Aplicar scripts na ordem: `memory_schema.sql` → `token_helpers.sql` →
     `buscar_memorias_semanticas.sql` → `memory_event_log.sql` → testes.
   - Verificar `EXPLAIN` (observabilidade) buscando regressões.
3. **Cutover**
   - Atualizar backend para chamar RPC (já compatível) e telemetria.
   - Monitorar logs e telemetria nas primeiras horas.

## Checklist de aceitação

- [ ] Tabelas/índices criados sem erro em staging.
- [ ] RLS confirmada via tentativas de acesso cruzado (usuário A não lê B).
- [ ] `pg_prove supabase/tests/memory_semantic_retrieval.sql` passa com sucesso.
- [ ] `buscar_memorias_semanticas` responde em < 150 ms p95 com 1k memórias / usuário.
- [ ] Eventos gravados em `telemetry.memory_event_log` são exportados pelo backend.
- [ ] `EXPLAIN` confirma uso de índice HNSW e filtros por usuário.

## Plano de rollback

- Reverter chamadas para o caminho anterior (REST direto) mantendo dados existentes.
- Executar `drop function public.buscar_memorias_semanticas` e remover índices HNSW se
  necessário.
- Caso novas colunas causem problemas, exportar dados, `drop table` e recriar com
  esquema anterior usando backup (`pg_dump` antes do deploy).
- Limpar telemetria com `drop schema telemetry cascade` se não for mais necessária.

## Próximos passos sugeridos

- Automatizar migração via Supabase CLI (`supabase db push`).
- Adicionar métricas de cardinalidade/latência do RPC em dashboards (Grafana ou Supabase
  Observability).
- Integrar pipeline CI para executar `pg_prove` e validar `EXPLAIN` (ex.: via `psql` +
  `grep` garantindo uso de índice HNSW).

