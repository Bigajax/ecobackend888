# ECO Backend Analytics & Feedback Service

## Visão Geral
A API de backend da ECO coleta sinais de uso em três estágios principais do pipeline:

1. **Interações** – cada mensagem gerada registra o `interaction_id`, metadados de prompt, módulos habilitados e métricas de tokens para auditoria operacional.
2. **Feedback explícito** – votos de "up"/"down" do usuário enriquecidos com motivo e origem, garantindo rastreabilidade para ajustes de UX.
3. **Latência** – amostras de TTFB/TTLC por resposta que alimentam alertas de desempenho.

Todos os eventos são gravados no schema `analytics`, que concentra métricas operacionais consumidas por pipelines internos e pelo Metabase. O schema **não possui RLS habilitado** e o acesso se dá via credenciais _service-role_ protegidas no backend.

## Variáveis de Ambiente
Configure as variáveis abaixo para executar o serviço e suas integrações:

| Variável | Descrição |
| --- | --- |
| `SUPABASE_URL` | URL do projeto Supabase utilizado para persistir analytics. |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave _service-role_ usada apenas pelo backend para inserir dados no schema `analytics`. |
| `API_URL` | Base URL pública do backend (ex.: `https://api.eco.ai`). Utilizada pelos scripts de _smoke test_. |
| `ALLOWED_ORIGINS` | Lista de origens permitidas pelo middleware de CORS. |

## Rotas HTTP
Todas as rotas residem no mesmo domínio do backend com prefixo `/api`.

### `POST /api/feedback`
* **Resposta:** `204 No Content`
* **Payload:**
  ```json
  {
    "interaction_id": "uuid opcional",
    "response_id": "uuid opcional",
    "vote": "up" | "down",
    "reason": "texto opcional",
    "pillar": "geral | empatia | ...",
    "arm": "identificador do braço"
  }
  ```
  > Obs.: pelo menos um entre `interaction_id` e `response_id` deve ser informado. Quando o braço não é enviado pelo front, o backend infere a partir do primeiro módulo utilizado e recorre ao valor `baseline` como _fallback_.
* **Exemplo (smoke test):**
  ```bash
  curl -i -X POST "$API_URL/api/feedback" \
    -H "Content-Type: application/json" \
    -d '{
      "interaction_id": "00000000-0000-0000-0000-000000000001",
      "vote": "up",
      "pillar": "geral"
    }'
  ```

### `POST /api/interaction`
* **Resposta:** `201 Created`
* **Payload:**
  ```json
  {
    "interaction_id": "uuid",
    "session_id": "optional",
    "user_id": "optional uuid or null",
    "message_id": "optional",
    "prompt_hash": "optional",
    "module_combo": ["module-a", "module-b"],
    "tokens_in": 123,
    "tokens_out": 456,
    "latency_ms": 789,
    "meta": { "qualquer": "json" }
  }
  ```
* **Exemplo:**
  ```bash
  curl -i -X POST "$API_URL/api/interaction" \
    -H "Content-Type: application/json" \
    -d '{
      "interaction_id": "00000000-0000-0000-0000-000000000002",
      "session_id": "SESSION-123",
      "prompt_hash": "hash-xyz",
      "module_combo": ["core", "memoria"],
      "tokens_in": 200,
      "tokens_out": 350,
      "latency_ms": 123
    }'
  ```

### `POST /api/latency`
* **Resposta:** `204 No Content`
* **Payload:**
  ```json
  {
    "response_id": "uuid",
    "ttfb_ms": 110,
    "ttlc_ms": 450,
    "tokens_total": 512
  }
  ```
* **Exemplo:**
  ```bash
  curl -i -X POST "$API_URL/api/latency" \
    -H "Content-Type: application/json" \
    -d '{
      "response_id": "00000000-0000-0000-0000-000000000003",
      "ttfb_ms": 120,
      "ttlc_ms": 480,
      "tokens_total": 550
    }'
  ```

## Modelagem no Supabase
| Tabela | Campos principais |
| --- | --- |
| `analytics.eco_feedback` | `id`, `interaction_id`, `user_id`, `session_id`, `vote`, `reason`, `source`, `meta`, `created_at` |
| `analytics.eco_interactions` | `id` (`interaction_id`), `user_id`, `session_id`, `message_id`, `prompt_hash`, `module_combo`, `tokens_in`, `tokens_out`, `latency_ms`, `meta`, `created_at` |
| `analytics.latency_samples` | `response_id`, `ttfb_ms`, `ttlc_ms`, `tokens_total`, `created_at` |

> Consulte `docs/analytics-schema.md` para detalhes adicionais do schema `analytics`.

## Observabilidade
* Os handlers de rota registram logs `info` em caso de sucesso e `warn`/`error` para falhas no Supabase, sempre omitindo payloads sensíveis.
* Utilize `interaction_id` e `response_id` como IDs de correlação ao investigar fluxos no Metabase e nos logs do backend.
* Em caso de `404`, verifique se o módulo HTTP importou corretamente `feedbackRoutes` e se os testes `server/tests/feedbackRoutes.test.ts` foram executados (`npm test -- feedbackRoutes`).

## Metabase
Sugestões de cartões para o dashboard operacional:
1. **TTFB x Tokens (últimos 7d)** – gráfico de dispersão usando `analytics.latency_samples` ou `analytics.v_latency_recent` filtrado por data.
2. **Distribuição de voto (up/down)** – gráfico de colunas a partir de `analytics.eco_feedback` agregando por `vote` nos últimos 30 dias.
3. **Top motivos de dislike** – tabela ou _bar chart_ que conta ocorrências de `reason` em `analytics.eco_feedback` com filtro `vote = 'down'`.

Para habilitar as views de apoio, execute:
```bash
supabase db push --file supabase/schema/analytics_rest_v2.sql
```

## Smoke Tests
| Comando | Resultado esperado |
| --- | --- |
| `curl ... /api/feedback` | `HTTP/1.1 204 No Content` sem corpo. |
| `curl ... /api/interaction` | `HTTP/1.1 201 Created` com `{ "id": "<interaction_id>" }`. |
| `curl ... /api/latency` | `HTTP/1.1 204 No Content` sem corpo. |

## Roadmap
* **Upsert** completo de `analytics.eco_interactions` preservando colunas atualizadas ao reenviar o mesmo `interaction_id`.
* **Deduplicação por `prompt_hash`** para consolidar variantes do mesmo prompt.
* **RLS granular** em views públicas futuras (`security_invoker`) caso seja necessário expor métricas diretamente ao front.
