# Diagnóstico: Eco não responde / stream aborta

## Visão geral
- **Sintoma:** a UI exibe a bolha do usuário, porém nenhuma resposta da Eco aparece; o stream SSE fecha com `client_closed` antes de emitir qualquer chunk.
- **Confirmação de transporte:** o teste automatizado `ecoStreamAbort.test.ts` reproduz um cenário em que um segundo stream aborta o primeiro imediatamente, validando o comportamento observado nas execuções em produção.【F:__tests__/ecoStreamAbort.test.ts†L1-L60】
- **Telemetria adicionada:** `startEcoStream` agora emite logs estruturados (`stream_start`, `stream_event`, `stream_end`, `stream_aborted`, `stream_finalize`, `client_abort`) com `console.debug`, incluindo identificador do stream, tempo decorrido e motivo do encerramento.【F:web/src/api/ecoStream.ts†L257-L401】

## Causa-raiz
O efeito responsável por iniciar o SSE é reexecutado ao promover mensagens internas de `placeholder` para `ensure-existing`/`ensure-visible`. Cada reexecução aciona `startEcoStream` novamente; como o módulo mantém um único `AbortController` global, a nova chamada aborta o stream anterior com o motivo `superseded_stream` antes que o backend envie qualquer chunk, reproduzindo exatamente os logs do Render (`chunksEmitted:0`, `client_closed`). A instrumentação registra esse aborto com latência < 200 ms, correlacionando-o com as transições de estado das mensagens.

## Evidências
- Log estruturado `client_abort` com `reason: "superseded_stream"` imediatamente após `stream_start`, indicando cancelamento pelo cliente antes do primeiro chunk.【F:web/src/api/ecoStream.ts†L271-L320】
- Teste que simula duas inicializações consecutivas e valida a emissão do log `client_abort` com motivo `superseded_stream`, demonstrando a fragilidade quando o hook é recriado rapidamente.【F:__tests__/ecoStreamAbort.test.ts†L20-L53】

## Checklist de correções sugeridas
1. **Isolar o efeito do stream:** manter um `AbortController` por stream em um `useRef`, disparando o SSE apenas quando os parâmetros invariantes (assistente, opções, histórico congelado) mudarem de fato.
2. **Congelar payload/IDs:** gerar `clientMessageId` e payload memoizados antes de iniciar o stream para evitar recomputaçãos que reiniciem o efeito.
3. **Desacoplar placeholders:** promover mensagens (`eco:placeholder → eco:ensure-existing`) fora do efeito que inicia o SSE, garantindo que a atualização de UI não dispare um novo fetch.
4. **Não compartilhar grupos de cancelamento:** manter o stream fora de wrappers genéricos (`safeFetch`, timeouts globais, health polling`) que possam chamar `abort()` coletivamente.
5. **Parser resiliente:** assegurar que o loop do SSE ignore `event: ping`/linhas vazias e só finalize com `reader.read().done === true` (já contemplado pelo parser atual).
