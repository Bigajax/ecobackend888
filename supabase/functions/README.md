# Memory RPC compatibility

Este README documenta o wrapper `public.buscar_memorias_semanticas` criado para
preservar a assinatura legada ao mesmo tempo em que delega à RPC
`public.buscar_memorias_semelhantes_v2`.

## Assinatura observada de `public.buscar_memorias_semelhantes_v2`

Para confirmar a ordem e os tipos dos argumentos foi executada a consulta:

```sql
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'buscar_memorias_semelhantes_v2';
```

O resultado indica a seguinte assinatura (ordem e tipos):

| # | Argumento       | Tipo             |
|---|-----------------|------------------|
| 1 | query_embedding | vector(1536)     |
| 2 | user_id_input   | uuid             |
| 3 | match_count     | integer          |
| 4 | match_threshold | double precision |
| 5 | days_back       | integer          |

Esses nomes também são os esperados pelos clientes existentes que já chamam a
RPC v2 diretamente.【F:server/services/buscarMemorias.ts†L78-L117】【F:server/services/buscarEncadeamentos.ts†L52-L101】

## Mapeamento legado → v2

O wrapper traduz os argumentos antigos para os novos parâmetros conforme a
tabela abaixo.【F:supabase/functions/buscar_memorias_semanticas_wrapper.sql†L1-L132】

| Legado                         | Normalização aplicada                                         | Parâmetro v2            |
|--------------------------------|----------------------------------------------------------------|-------------------------|
| `p_usuario_id` (uuid)          | Passado diretamente (pode ser `NULL`)                          | `user_id_input`         |
| `p_query` (vector)             | Obrigatório; se `NULL` resulta em retorno vazio                | `query_embedding`       |
| `p_limit` (integer)            | `GREATEST(coalesce(p_limit, 5), 1)`                            | `match_count`           |
| `p_lambda_mmr` (float8)        | `LEAST(GREATEST(coalesce(p_lambda_mmr, 0.5), 0), 1)`           | `match_threshold`       |
| `p_recency_halflife_hours`     | `CEIL(coalesce(p_recency_halflife_hours, 720) / 24)` → dias    | `days_back`             |
| `p_include_referencias` (bool) | Filtra referências quando `FALSE` após o retorno do v2         | — (tratado pós-select)  |
| `p_tags` (text[])              | Normalizado para `'{}'::text[]`; compat apenas                 | —                       |
| `p_token_budget` (int)         | `COALESCE(p_token_budget, 1200)` (sem efeito direto no v2)     | —                       |
| `p_emocao`, `p_query_emocional`| Preservados e reexpandidos no shape final quando disponíveis   | —                       |

O conjunto de colunas retornado replica o layout histórico da função legada e é
construído a partir das tabelas `public.memories` e
`public.referencias_temporarias`, preservando a ordenação pelo `similarity` que a
RPC v2 devolve.【F:supabase/functions/buscar_memorias_semanticas_wrapper.sql†L47-L129】

## Defaults adotados quando os argumentos chegam como `NULL`

- `p_limit`: 5
- `p_lambda_mmr`: 0.5
- `p_include_referencias`: `FALSE`
- `p_recency_halflife_hours`: 720 (≈ 30 dias)
- `p_tags`: `{}`
- `p_token_budget`: 1200
- `p_emocao` e `p_query_emocional`: preservados como `NULL`

Esses valores reproduzem o comportamento sugerido no pedido da task e evitam
quebras mesmo quando clientes antigos não enviam todos os parâmetros.【F:supabase/functions/buscar_memorias_semanticas_wrapper.sql†L27-L70】
