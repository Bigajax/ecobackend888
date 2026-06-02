# Modelo de dados (Supabase)

## Schemas e tabelas principais
### `public.memories`
Armazena memórias emocionais permanentes (intensidade ≥ 7) com embeddings `vector(1536)` e `vector(256)` para similaridade semântica e emocional. Índices HNSW aceleram busca por `embedding` e `embedding_emocional` e existem gatilhos `BEFORE UPDATE` para atualizar `updated_at` automaticamente.【F:supabase/schema/memory_schema.sql†L32-L88】

### `public.referencias_temporarias`
Memórias transitórias (intensidade < 7) com mesmas colunas de taxonomia (`tags`, `dominio_vida`, `emocao_principal`) e campos de expiração. Compartilha índices GIN/HNSW e gatilhos de `updated_at` para consistência com `memories`.【F:supabase/schema/memory_schema.sql†L12-L80】

### RLS
Ambas as tabelas têm Row Level Security habilitada. Políticas garantem que usuários só vejam/alterem seus registros (`auth.uid() = usuario_id`) e permitem bypass para a role `service_role` utilizada pelo backend.【F:supabase/schema/memory_schema.sql†L90-L132】

### `analytics` schema
- `analytics.resposta_q`: snapshots de qualidade (score Q, flags estruturado/memória/bloco, tokens, latências). Índices por data e `user_id` auxiliam dashboards.【F:supabase/schema/analytics_schema.sql†L1-L36】
- `analytics.module_outcomes`: tokens e métricas por módulo aditivo, indexado por `module_id`.【F:supabase/schema/analytics_schema.sql†L37-L56】
- `analytics.bandit_rewards`: recompensas por braço e pilar com índice único `(response_id, arm)`.【F:supabase/schema/analytics_schema.sql†L57-L88】
- `analytics.knapsack_decision`: decisão do otimizador de módulos (budget, ganho, tokens).【F:supabase/schema/analytics_schema.sql†L89-L106】
- `analytics.latency_samples`: amostras TTFB/TTLC vinculadas ao `response_id`.【F:supabase/schema/analytics_schema.sql†L107-L124】

### Feedback & sinais
O schema `analytics` também define `eco_interactions`, `eco_feedback`, `eco_passive_signals`, `eco_bandit_arms`, `eco_module_usages` e `eco_policy_config`, além de views auxiliares `vw_interactions`, `vw_module_usages` e `vw_bandit_rewards`. Esses objetos dão suporte aos fluxos de feedback e bandits e têm índices por `interaction_id` para leitura eficiente.【F:supabase/schema/eco_feedback_schema.sql†L1-L88】

## Funções e RPCs
### `public.buscar_memorias_semanticas`
Função PL/pgSQL que combina memórias permanentes e temporárias, calcula um score composto (similaridade semântica 55%, emocional 15%, recência 15%, tags 10%, emoção 5%, boost de `pin`) e aplica MMR + orçamento de tokens antes de retornar resultados limitados (`p_limit`).【F:supabase/functions/buscar_memorias_semanticas.sql†L1-L168】

### `public.buscar_memorias_semanticas_v2`
Wrapper SQL expõe a função anterior com parâmetros default (limite 12, orçamento 1800 tokens, `lambda_mmr` 0.6) sob o nome `_v2`. O backend chama essa RPC via `SupabaseClient.rpc`, aplicando thresholds adaptativos, filtrando autocitações e validando identidade antes de retornar linhas com `composite_score` e `effective_score`.【F:supabase/functions/buscar_memorias_semanticas_v2.sql†L1-L55】【F:server/services/supabase/semanticMemoryClient.ts†L96-L198】

### `analytics.update_bandit_arm`
Atualiza estatísticas Beta (`alpha`, `beta`) e contadores de um braço de bandit sempre que uma recompensa é enviada.【F:supabase/schema/eco_feedback_schema.sql†L36-L63】

### Utilitários de tokenização
`supabase/functions/token_helpers.sql` define funções auxiliares (contagem de tokens) usadas pelos scripts principais (ver arquivo para detalhes específicos).【F:supabase/functions/token_helpers.sql†L1-L120】

## Embeddings e limites
- Dimensão padrão: 1.536 (`embedding`) e 256 (`embedding_emocional`).【F:supabase/schema/memory_schema.sql†L34-L67】
- `token_count` calculado como `ceil(length(texto)/4.0)` para controlar orçamento em `buscar_memorias_semanticas`.【F:supabase/schema/memory_schema.sql†L22-L67】
- O RPC aplica `p_token_budget` (default 1.800) e `match_count` 5 (FAST/DEEP) para evitar estouro de contexto.【F:supabase/functions/buscar_memorias_semanticas.sql†L5-L168】【F:server/services/supabase/memoriaRepository.ts†L25-L48】

## Controle de acesso
O backend usa duas modalidades de credenciais Supabase:
1. **Service role** – `SUPABASE_SERVICE_ROLE_KEY` para operações administrativas (`ensureSupabaseConfigured`).【F:server/lib/supabaseAdmin.ts†L12-L38】
2. **Analytics schema** – `SUPABASE_ANALYTICS_SERVICE_ROLE_KEY` opcional; se presente substitui a chave padrão ao criar `supabase.schema("analytics")`. Logs informam quando alguma chave está ausente.【F:server/services/supabaseClient.ts†L7-L24】

RLS garante que clientes autenticados via JWT só acessem memórias do próprio `auth.uid`, enquanto o backend (service role) tem acesso total para persistir analytics e resultados das conversas.【F:supabase/schema/memory_schema.sql†L90-L132】
