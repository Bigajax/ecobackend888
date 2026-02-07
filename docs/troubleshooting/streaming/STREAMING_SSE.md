# Streaming SSE do ECO

## Negociação de conexão
1. Cliente chama `GET /api/ask-eco` com `Accept: text/event-stream`. Headers `X-Eco-Guest-Id` e `X-Eco-Session-Id` são exigidos (UUID v4); valores podem vir por query/body e são espelhados na resposta.【F:server/middleware/ensureIdentity.ts†L31-L117】【F:server/routes/promptRoutes.ts†L592-L734】
2. `prepareSse` remove `Content-Length`, aplica CORS da allowlist e escreve `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no` e `Access-Control-Expose-Headers: x-eco-*`. Um comentário `:ok` e heartbeats `:heartbeat` mantêm a conexão ativa.【F:server/utils/sse.ts†L6-L111】
3. Identidade e streamId são devolvidos em headers `X-Eco-Guest-Id`, `X-Eco-Session-Id`, `X-Stream-Id`. Caso a origem não esteja autorizada a conexão é rejeitada com `403` antes do handshake.【F:server/routes/promptRoutes.ts†L696-L752】

## Eventos emitidos
`SseEventHandlers` encapsula a saída no formato `event: <tipo>\ndata: <json>\n\n`, sempre anexando `streamId` para correlação.【F:server/sse/sseEvents.ts†L133-L211】 Eventos principais:

| Evento | Descrição | Payload | Origem |
| --- | --- | --- | --- |
| `prompt_ready` (`control`) | Confirma que o orquestrador iniciou a chamada LLM; contém `interaction_id`. | `{ type: "control", name: "prompt_ready", streamId, ... }` | `createSSE.prompt_ready()` é disparado quando o pipeline está pronto.【F:server/utils/sse.ts†L112-L140】【F:server/services/conversation/streamingOrchestrator.ts†L134-L176】 |
| `chunk` | Texto incremental da resposta; primeiro chunk marca `firstToken`. | `{ type: "chunk", streamId, index, delta }` | Emissor registra tamanho/latência em `SseStreamState.recordChunk`.【F:server/sse/sseState.ts†L176-L200】【F:server/services/conversation/streamingOrchestrator.ts†L146-L199】 |
| `meta` | Metadados (emoção, intensidade, tags) calculados durante a decisão. | `{ type: "meta", data: {...} }` | `sendMeta` agrega no estado para uso do `done`.【F:server/sse/sseEvents.ts†L229-L263】 |
| `memory_saved` | Confirma persistência de uma memória no Supabase. | `{ saved: true, meta: {...} }` | Emitido quando `salvarMemoriaViaRPC` retorna sucesso.【F:server/sse/sseEvents.ts†L264-L276】【F:server/services/conversation/streamingOrchestrator.ts†L200-L213】 |
| `error` | Erro recuperável (validação, timeout, falha LLM). | `{ reason, message, ... }` | Gera log `[ask-eco] sse_error` e marca stream como em erro.【F:server/sse/sseEvents.ts†L277-L309】 |
| `done` | Encerramento normal com resumo, tokens e timings. | `{ done:true, payload:{content, tokens, timings}, meta:{usage,finishReason}, index }` | Disparado por `sendDone`/`ensureGuardFallback`, garante que clientes recebam resumo completo.【F:server/sse/sseEvents.ts†L187-L233】【F:server/sse/sseEvents.ts†L310-L367】 |

Após `done`, `createSSE` ainda envia `stream_done` como evento `control` para clientes que implementam handshake extra.【F:server/utils/sse.ts†L112-L140】

## Timeouts e watchdogs
- **Idle timeout** – Configurável via `ECO_SSE_TIMEOUT_MS`; `SseStreamState` acompanha `lastEventAt` e encerra conexões inativas via `releaseActiveStream`.【F:server/routes/promptRoutes.ts†L441-L575】【F:server/sse/sseState.ts†L23-L118】
- **First token watchdog** – `ECO_FIRST_TOKEN_TIMEOUT_MS` ativa timer que emite `guard_fallback` se nenhum chunk for enviado, injetando mensagem padrão (“Não consegui responder agora...”) e finalizando com `finishReason` `guard_fallback`.【F:server/routes/promptRoutes.ts†L448-L575】【F:server/sse/sseEvents.ts†L240-L308】
- **Ping interval** – `ECO_SSE_PING_INTERVAL_MS` controla emissão de comentários `:heartbeat` para proxies que exigem tráfego contínuo.【F:server/routes/promptRoutes.ts†L474-L575】【F:server/utils/sse.ts†L86-L111】

## Deduplicação e concorrência
- `reserveActiveInteraction` impede múltiplos streams simultâneos para o mesmo par guest/session; libera automaticamente ao enviar `done` ou detectar abort do cliente.【F:server/routes/promptRoutes.ts†L520-L575】
- `clientMessageRegistry` evita processamento duplicado quando um `client_message_id` já foi concluído, retornando `409` ou reusando resultado cacheado.【F:server/routes/promptRoutes.ts†L520-L575】
- Abortos de cliente são classificados em `client_closed`, `proxy_closed`, `server_abort` para logs posteriores.【F:server/sse/sseState.ts†L23-L131】

## Exemplo de fluxo
```
event: control
data: {"type":"control","name":"prompt_ready","streamId":"...","interaction_id":"..."}

event: chunk
data: {"type":"chunk","delta":"Olá!","index":0,"streamId":"..."}

event: meta
data: {"type":"meta","data":{"intensidade":8,"emocao":"alegria","tags":["vitória"]},"streamId":"..."}

event: memory_saved
data: {"type":"memory_saved","saved":true,"meta":{"memoriaId":"..."},"streamId":"..."}

event: done
data: {"done":true,"payload":{"content":"Olá! Como posso ajudar?","tokens":{"in":521,"out":138},"sinceStartMs":4820},"meta":{"usage":{"input_tokens":521,"output_tokens":138},"finishReason":"completed"},"index":3,"streamId":"..."}
```
Os clientes devem fechar a conexão após `done` ou aguardar o servidor encerrar via `stream_done`. Eventos `error` podem aparecer antes de `done`, devendo ser tratados como falhas recuperáveis.
