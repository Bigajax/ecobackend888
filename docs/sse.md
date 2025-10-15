# Fluxo de SSE no endpoint `/api/ask-eco`

O endpoint de streaming expõe eventos Server-Sent Events (SSE) que seguem a
sequência abaixo:

1. **prompt_ready**: emitido como evento `control` logo após o handshake. Indica
   que o stream está disponível e envia metadata `stream: true`.
2. **first_token**: primeiro trecho de texto retornado pelo orquestrador. Além
   do evento específico, é emitida uma entrada de `meta` com a latência do
   primeiro token e o evento genérico `token`.
3. **chunk**: eventos subsequentes entregam os demais deltas de texto no formato
   `{ delta, index }`, além do espelhamento pelo evento `token`.
4. **done**: sinaliza o encerramento da resposta através de `control` com os
   contadores finais e encerra a conexão SSE de forma idempotente.

## Ciclo de vida

O helper `createSSE` centraliza o setup dos cabeçalhos, heartbeat (`ping`
periódico) e o *idle guard*. Cada chamada a `send` reinicia o temporizador de
ociosidade; quando o tempo limite é atingido, o handler de `onIdle` é chamado e o
stream é finalizado via `end()`. A função `end()` pode ser chamada múltiplas
vezes sem efeitos adversos, garantindo limpeza dos `setInterval`/`setTimeout`
e o fechamento seguro do `Response`.

A conexão também é encerrada automaticamente quando o cliente fecha o socket,
garantindo que recursos sejam liberados mesmo sem uma chamada explícita a
`end()`.
