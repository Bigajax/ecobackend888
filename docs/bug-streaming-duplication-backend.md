# Root Cause Summary

- **Reconexões simultâneas sem retomada por `Last-Event-ID`.** O controlador aceita qualquer `POST /api/ask-eco` que peça `text/event-stream`, mas não lê nem reaproveita `Last-Event-ID` ou `X-Stream-Id`; cada reconexão do browser gera um novo `createSSE` enquanto a sessão anterior continua viva, produzindo fluxos paralelos com o mesmo conteúdo.【F:server/routes/promptRoutes.ts†L402-L423】【F:server/routes/promptRoutes.ts†L519-L829】
- **Streams antigos seguem emitindo após o cliente sumir.** Há `req.on("close")` para marcar `clientClosed`, porém o backend não encadeia um `AbortController` ou `signal` para interromper `getEcoResponse`; os produtores continuam disparando `forwardEvent`, e sem dedupe o cliente recebe os dois fluxos quando reconecta.【F:server/routes/promptRoutes.ts†L1128-L1258】
- **Eventos sem identificador global.** `sendChunk` publica `event: first_token` e `event: chunk` reutilizando o mesmo `delta` sem incluir `interaction_id`; o índice só aparece no `chunk`, então o primeiro delta chega duas vezes e o frontend não consegue deduplicar sessões concorrentes.【F:server/routes/promptRoutes.ts†L1095-L1115】
- **Proxies podem agrupar deltas.** A infraestrutura garante `Cache-Control: no-cache, no-transform` e `flushHeaders`, mas se Render/Vercel retirarem `no-transform` ou habilitarem compressão, vários `delta` são entregues de uma só vez, aparentando duplicação.【F:server/utils/sse.ts†L47-L198】
- **Reemissão do primeiro texto.** A pipeline manda o mesmo conteúdo como `first_token` (sem índice) e imediatamente como `chunk {delta, index}`; quando duas conexões paralelas consomem, o front recebe quatro mensagens idênticas (dois `first_token`, dois `chunk`).【F:server/routes/promptRoutes.ts†L1102-L1111】

# Where It Happens

- **ask-eco SSE controller (`promptRoutes.ts`).** Converte o POST em SSE, cria `createSSE`, encaminha eventos (`forwardEvent`) e mantém estado da stream, mas não encerra produtores antigos nem propaga IDs únicos por evento.【F:server/routes/promptRoutes.ts†L402-L1258】
- **Utilitário de streaming (`server/utils/sse.ts`).** Define headers, heartbeat e encerramento, porém apenas fecha o `Response`; não interrompe quem escreve no stream original.【F:server/utils/sse.ts†L82-L220】
- **Emissores de eventos.** `sendChunk`, `sendMeta`, `sendLatency`, `sendErrorEvent` e `forwardEvent` geram `first_token`, `chunk`, `control`, `error` e `done` sem carimbar `(interaction_id, index)` consistentes.【F:server/routes/promptRoutes.ts†L1038-L1212】
- **Telemetria/Supabase.** Inserções em `eco_interactions` e `eco_passive_signals` são disparadas em paralelo e logam falhas, mas não bloqueiam a stream, confirmando que erros de banco (ex.: conflitos de chave) não explicam a duplicação de texto.【F:server/routes/promptRoutes.ts†L715-L777】【F:server/services/conversation/interactionAnalytics.ts†L77-L135】
- **Fluxo de orquestração (`getEcoResponse`).** Recebe `stream: { onEvent }` mas não expõe forma de cancelamento; reconexões mantêm múltiplos `EcoStreamHandler` ativos até o LLM concluir a geração.【F:server/routes/promptRoutes.ts†L1233-L1258】

# Proof / Validation Steps

1. **Confirmar headers SSE.** Inspecionar a resposta logo após `createSSE`: devem aparecer `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `Transfer-Encoding: chunked`, `X-Accel-Buffering: no` e `flushHeaders()` imediato.【F:server/utils/sse.ts†L47-L198】
2. **Teste `curl` sem buffering.** Executar `curl -N -H "Accept: text/event-stream" https://<host>/api/ask-eco -d '{"texto":"oi","usuario_id":"<uuid>"}' -H 'Content-Type: application/json'` e verificar se os eventos chegam ordenados.
3. **Fechar o cliente no meio do stream.** Com `curl` ativo, interromper a aba/websocket e observar logs: o servidor marca `sse_client_closed`, mas precisa também parar os emissores (verificar se não continuam registrando `sse_done`/`chunk`).【F:server/routes/promptRoutes.ts†L1128-L1178】
4. **Simular reconexão rápida.** Abrir dois `curl -N` simultâneos para o mesmo payload; observar se o backend mantém dois fluxos (`stream_start` duas vezes) sem invalidar o anterior.【F:server/routes/promptRoutes.ts†L915-L1053】
5. **Auditar índices por evento.** Registrar `interaction_id` retornado pela API e garantir que cada `event: chunk` carregue `(interaction_id, index)` crescente, sem repetição; hoje apenas `index` existe e o primeiro delta chega sem índice.【F:server/routes/promptRoutes.ts†L1095-L1111】
6. **Verificar `no-transform`.** Garantir (via `curl -I` ou trace) que Render/Vercel preservam `Cache-Control: no-cache, no-transform`; proxies que removem esse header podem bufferizar SSE.【F:server/utils/sse.ts†L47-L55】
7. **Correlacionar erros de Supabase.** Checar logs `[ask-eco] telemetry_failed`/`interaction.create_failed`: falhas são tratadas como warnings e não interrompem a stream, descartando-as como causa primária da duplicação.【F:server/routes/promptRoutes.ts†L715-L777】【F:server/services/conversation/interactionAnalytics.ts†L101-L134】

# Proposed Fix / Hardening (sem refatorar o core)

- **Unicidade de evento.** Padronizar payloads SSE para sempre incluir `interaction_id` (gerado por requisição ou recuperado de `getEcoResponse`) e `index` crescente em **todas** as mensagens de texto, inclusive `first_token` (usar `index = 0`).【F:server/routes/promptRoutes.ts†L1095-L1111】【F:server/routes/promptRoutes.ts†L1154-L1212】
- **Contrato consistente.** Emitir `event: chunk` com `data: {interaction_id,index,delta}`; se manter `event: first_token`, reutilizar o mesmo schema e evitar duplicar `delta` em eventos diferentes.【F:server/routes/promptRoutes.ts†L1102-L1111】
- **Encerramento confiável.** Conectar `req.on('close')` a um `AbortController` repassado para `getEcoResponse`/LLM para que streams antigos sejam abortados imediatamente quando o cliente desconectar.【F:server/routes/promptRoutes.ts†L1128-L1258】
- **Um fluxo por contexto.** Ao receber nova requisição com o mesmo `streamId`/`interaction_id`, localizar o stream ativo e encerrá-lo antes de criar outro `SSEConnection`.【F:server/routes/promptRoutes.ts†L421-L829】
- **Headers & flush.** Garantir `no-transform`, `Transfer-Encoding: chunked` e `flushHeaders()` inicial para impedir buffering e compressão automática nos proxies.【F:server/utils/sse.ts†L47-L198】
- **Pings sem conteúdo.** Manter heartbeat (`:\n\n`) apenas como keep-alive; evitar reutilizar o canal de ping para dados textuais para não confundir dedupe de cliente.【F:server/utils/sse.ts†L181-L209】
- **Idempotência em retries.** Reaproveitar `interaction_id` em retentativas e reiniciar `index` a partir do último valor entregue em vez de reenviar índices antigos.【F:server/routes/promptRoutes.ts†L1095-L1111】【F:server/routes/promptRoutes.ts†L1154-L1212】

# Proxy & Environment Checks

- Confirmar que rewrites Vercel ⇄ Render preservam `Cache-Control: no-cache, no-transform` e `X-Accel-Buffering: no` do backend.【F:server/utils/sse.ts†L47-L55】
- Garantir que nenhuma etapa aplica compressão (`Content-Encoding: gzip/br`) ao endpoint SSE.
- Verificar que HTTP/1.1 permanece com `Transfer-Encoding: chunked`; HTTP/2 ou buffering podem juntar deltas.
- Testar com `curl -N --no-buffer` contra Render direto para assegurar ausência de buffering adicional.
- Checar timeouts/idle do proxy (Render/Vercel) para confirmar que não encerram streams antes do `done`.

# Observations and Next Steps

- O frontend só conseguirá deduplicar se receber `(interaction_id, index)` consistentes; hoje `first_token` chega sem índice e sem `interaction_id`, impossibilitando a lógica de client-side dedupe.【F:server/routes/promptRoutes.ts†L1102-L1111】
- Métricas sugeridas: contagem de streams simultâneos por `streamId`/`sessionId`, número de `onEvent` (`chunk`) por `interaction_id`, taxa de `onError`/`onDone` e monitoramento de índices repetidos ou fora de ordem.【F:server/routes/promptRoutes.ts†L915-L1258】
- Plano de roll-out: validar em staging com script de reconexão rápida (duas conexões em paralelo), observar logs `stream_start`/`stream_end`, garantir cancelamento correto e só então liberar em produção.【F:server/routes/promptRoutes.ts†L915-L1145】
- Registrar que erros recorrentes de Supabase (`telemetry_failed`, conflitos de `eco_interactions`) continuam monitorados, mas não são responsáveis pela duplicação textual observada.【F:server/routes/promptRoutes.ts†L715-L777】【F:server/services/conversation/interactionAnalytics.ts†L101-L134】
