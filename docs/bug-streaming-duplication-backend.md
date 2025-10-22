# Streaming Duplication – Backend Checklist

## Root Cause Summary
- SSE handler emite um único fluxo por requisição; duplicações surgem quando o cliente reconecta sem enviar `Last-Event-ID`, forçando nova sessão enquanto a anterior ainda processa.
- Sem `req.on('close')` + `AbortController`, o backend mantém o stream original ativo e ele continua emitindo deltas mesmo após o cliente sumir.
- Proxies/CDNs podem reenfileirar blocos se o stream não usar `no-transform` + `chunked`, resultando em pacotes agrupados ou atrasados.
- Compressão ou buffering intermediário (Render/Vercel) introduzem latência e podem soltar vários chunks juntos, parecendo duplicação.

## Checklist de Headers SSE
```js
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache, no-transform');
res.setHeader('Connection', 'keep-alive');
res.setHeader('Transfer-Encoding', 'chunked');
res.flushHeaders?.(); // indispensável quando há compression/proxy
```

## Garantias de Unicidade
- Gere `interaction_id` por requisição (UUID ou hash do payload) e incremente `index` a cada delta.
- Escreva sempre com `event: chunk` seguido de `data:` serializado contendo ambos os campos.
- Exemplo:

```
event: chunk
data: {"interaction_id":"b6f2c76e-3ba6-4d4c-9c3b-4cc89b6da3f1","index":12,"delta":"..."}
```

## Proposed Fix / Hardening
```js
app.post('/api/ask-eco', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const interaction_id = crypto.randomUUID();
  const ctrl = new AbortController();
  req.on('close', () => ctrl.abort());

  let idx = 0;
  const send = (payload) => {
    res.write('event: chunk\n');
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  streamLLM({
    signal: ctrl.signal,
    onDelta: (delta) => send({ interaction_id, index: idx++, delta }),
    onPing: () => res.write('event: ping\n\n'),
    onDone: () => {
      res.write('event: done\n\n');
      res.end();
    },
    onError: (err) => {
      res.write('event: error\n');
      res.write(`data: ${JSON.stringify({ interaction_id, message: err.message })}\n\n`);
      res.end();
    }
  });
});
```

## Verificações de Ambiente/Proxy
- Confirmar que o rewrite Vercel → Render mantém `Cache-Control: no-transform` e não aplica compressão.
- Verificar se Render não acrescenta buffering ou gzip no endpoint `/api/ask-eco` (usar `curl -N` e `--no-buffer`).
- Garantir suporte a conexões persistentes (HTTP/1.1) e que `Transfer-Encoding: chunked` apareça na resposta.

## Observações Extra
- Logs de "All object keys must match" (Supabase) e outros erros de memória são incidentes independentes; não interferem na duplicação de deltas.
