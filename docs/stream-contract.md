# Contrato de Streaming e Dedupe

Este documento resume as garantias que sustentam o mantra "1 mensagem, 1 bolha, 1 linha no banco" para o endpoint `POST /api/ask-eco`.

## 1. Um único stream por mensagem

- O cliente usa `streamConversation`/`startEcoStream` para iniciar o SSE. Antes de disparar um novo fetch o módulo aborta imediatamente o stream anterior via `AbortController`, garantindo que nunca existam dois fluxos ativos ao mesmo tempo no browser.【F:web/src/api/ecoStream.ts†L268-L338】【F:web/src/api/chatStreamClient.ts†L69-L151】
- Eventos `chunk` repetidos ou fora de ordem são ignorados. O cliente só atualiza a bolha quando recebe um índice novo e sequencial, descartando duplicatas e mantendo o texto agregado por `onText` via replace, nunca via push.【F:web/src/api/chatStreamClient.ts†L87-L134】

## 2. Dedupe agressivo no backend

- Cada payload deve enviar um `clientMessageId` único. O servidor reserva a combinação identidade + `clientMessageId` antes de acionar o orquestrador; duplicatas retornam HTTP 409 e não executam outra rodada nem criam novas interações.【F:server/routes/promptRoutes.ts†L585-L704】
- Streams concorrentes para o mesmo `streamId` (ou `sessionId`) são abortados com `superseded_stream`, liberando o slot antigo e registrando o evento no log para observabilidade.【F:server/routes/promptRoutes.ts†L840-L908】【F:server/routes/promptRoutes.ts†L1358-L1384】

## 3. Telemetria consistente

- Uma única chamada a `createInteraction` abre a linha em `analytics.eco_interactions`. Ao concluir com sucesso marcamos a reserva do `clientMessageId` como "completed"; abortos liberam a chave para reenvio.【F:server/routes/promptRoutes.ts†L829-L964】【F:server/routes/promptRoutes.ts†L1224-L1298】
- Sinais passivos (`first_token`, `done`, `view`) são enfileirados até o `interaction_id` estar conhecido, evitando inserts duplicados e preservando a integridade em Supabase.【F:server/routes/promptRoutes.ts†L904-L1018】

## 4. Cobertura de testes

- `server/tests/routes/askEcoSseStreaming.test.ts` valida que duplicatas recebem 409, que um novo stream com o mesmo `streamId` aborta o anterior com log coerente e que três envios em sequência produzem SSEs independentes com `chunk` iniciando em índice 0.【F:server/tests/routes/askEcoSseStreaming.test.ts†L400-L567】

## 5. Checklist de verificação manual

1. Duplo clique em "Enviar" deve manter um único `/api/ask-eco` ativo; abortos antigos aparecem com `superseded_stream` no console.
2. Cada bolha nasce no `chunk` índice 0 e é atualizada por replace conforme `onText` agrega os tokens.
3. Sequência de três mensagens deve gerar três SSEs completos (`chunk` + `done`), três bolhas finais e três linhas de analytics.
4. Logs/analytics não exibem `duplicate key` ou `stream_done` repetido.

Seguir estes pontos assegura a entrega KISS do fluxo Eco: simples, consistente e deduplicado de ponta a ponta.
