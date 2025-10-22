# Resumo da causa

- Streams SSE permaneciam ativos após a desconexão do cliente, permitindo múltiplos produtores em paralelo com o mesmo conteúdo quando reconexões ocorriam rapidamente.【F:server/routes/promptRoutes.ts†L430-L488】【F:server/routes/promptRoutes.ts†L1205-L1243】
- O backend reemitia o primeiro trecho tanto como `first_token` quanto como `chunk`, fazendo o mesmo texto chegar duas vezes ao consumidor.【F:server/services/conversation/streamingOrchestrator.ts†L407-L446】
- Eventos de texto não carregavam identificadores estáveis, impossibilitando deduplicação por `(interaction_id, index)` no front-end.【F:server/routes/promptRoutes.ts†L1088-L1113】

# O novo contrato de evento

- Todo delta textual é enviado apenas como `event: chunk` com `data: {"interaction_id","index","delta"}`; o primeiro chunk usa `index = 0` e nenhum outro evento replica o mesmo texto.【F:server/routes/promptRoutes.ts†L1088-L1113】
- O controlador injeta o `interaction_id` gerado para a requisição (ou recuperado da orquestração) antes de qualquer emissão e o reutiliza em todos os chunks.【F:server/routes/promptRoutes.ts†L872-L917】【F:server/routes/promptRoutes.ts†L921-L928】
- Headers de SSE forçam entrega sem buffering: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Transfer-Encoding: chunked`, `X-Accel-Buffering: no` e `flushHeaders()` imediato.【F:server/utils/sse.ts†L37-L63】【F:server/utils/sse.ts†L94-L129】

# Como abort é propagado

- Cada stream cria um `AbortController`; `req.on('close')` e qualquer reconexão com o mesmo `streamId`/sessão invocam `abort()`, encerrando o produtor anterior antes de abrir o novo.【F:server/routes/promptRoutes.ts†L406-L488】
- O `abortSignal` é repassado até o orquestrador e ao cliente Claude/OpenRouter, que interrompe imediatamente a leitura do stream assim que o sinal é cancelado.【F:server/services/ConversationOrchestrator.ts†L630-L705】【F:server/services/conversation/streamingOrchestrator.ts†L360-L415】【F:server/core/ClaudeAdapter.ts†L205-L344】
- Logs e telemetria registram o motivo (`client_closed`, `superseded_stream`, etc.), e a limpeza remove a sessão ativa do mapa para impedir emissores órfãos.【F:server/routes/promptRoutes.ts†L928-L1009】【F:server/routes/promptRoutes.ts†L1115-L1187】

# Testes manuais

1. **Fluxo básico**: `curl -N -H "Accept: text/event-stream" -H "Content-Type: application/json" -d '{"texto":"oi","usuario_id":"<uuid>"}' https://<host>/api/ask-eco` → verificar sequência `event: chunk` com índices `0,1,2…` e JSON contendo `interaction_id` único.【F:server/routes/promptRoutes.ts†L1088-L1113】
2. **Reconexão simultânea**: iniciar dois `curl` com o mesmo payload; o segundo deve continuar emitindo enquanto o primeiro é encerrado com `superseded_stream` nos logs.【F:server/routes/promptRoutes.ts†L430-L488】【F:server/routes/promptRoutes.ts†L1215-L1243】
3. **Abort manual**: cancelar (`CTRL+C`) o `curl`; o servidor deve registrar `sse_client_closed` e nenhum chunk extra após o encerramento.【F:server/routes/promptRoutes.ts†L1001-L1018】【F:server/routes/promptRoutes.ts†L1215-L1243】
4. **Headers do proxy**: `curl -I https://<host>/api/ask-eco` → confirmar ausência de `Content-Encoding`, presença de `text/event-stream`, `no-cache, no-transform`, `Transfer-Encoding: chunked` e `X-Accel-Buffering: no`.【F:server/utils/sse.ts†L37-L63】
