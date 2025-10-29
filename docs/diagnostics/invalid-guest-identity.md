# Diagnóstico — 400 invalid_guest_id no /api/ask-eco

## Resumo do incidente
- **Sintoma**: O frontend recebe `Eco stream request failed (400)` com corpo `{"error":"invalid_guest_id","message":"Envie um UUID v4 em X-Eco-Guest-Id"}` logo ao iniciar o SSE de `/api/ask-eco`.
- **Impacto**: A conversa não inicia e a interface permanece aguardando o stream.
- **Ambiente**: `GET /api/ask-eco` (SSE) em ambientes de homologação/produção.

## O que o backend espera
1. O middleware `ensureGuestIdentity` valida o cabeçalho `X-Eco-Guest-Id` e o cookie `guest_id`. Caso não exista um valor válido, ele gera um novo UUID v4. Se um valor inválido for enviado nos cabeçalhos/cookies, a requisição é rejeitada com `400 invalid_guest_id` quando o caminho exige identidade de guest (ex.: `/api/ask-eco`).【F:server/core/http/guestIdentity.ts†L6-L155】
2. Para o SSE, a identidade também pode ser enviada via query string (`guest_id` e `session_id`). O contrato publicado em `/api/contract` lista `guest_id` como **required** e exige formato UUID v4.【F:server/core/http/app.ts†L244-L304】
3. O helper `readIdentity` só considera valores UUID v4. Strings vazias, `undefined` ou qualquer formato diferente são descartados e tratados como falta de identidade.【F:server/utils/requestIdentity.ts†L1-L66】

## Causa raiz provável
- O frontend está inicializando o `EventSource` sem `guest_id` ou com um valor não normalizado (ex.: `undefined`, string vazia, ou identificadores temporários que não seguem UUID v4). Quando esse valor inválido chega ao backend via cabeçalho ou query, o middleware acusa erro e a conexão é interrompida imediatamente.

## Como corrigir no frontend
1. Gere `guestId` e `sessionId` usando UUID v4 (ex.: `crypto.randomUUID()` ou biblioteca equivalente). Persistir em storage local para reutilizar entre requisições.
2. **SSE**: montar a URL com `guest_id` e `session_id` (sempre no formato UUID v4). Exemplo:
   ```ts
   const url = new URL(`${BACKEND}/api/ask-eco`);
   url.searchParams.set('guest_id', guestId);
   url.searchParams.set('session_id', sessionId);
   const eventSource = new EventSource(url);
   ```
3. **Fallback JSON**: enviar os mesmos valores nos headers obrigatórios:
   ```ts
   fetch(`${BACKEND}/api/ask-eco`, {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'X-Eco-Guest-Id': guestId,
       'X-Eco-Session-Id': sessionId,
     },
     body: JSON.stringify({ message, history }),
   });
   ```
4. Nunca enviar placeholders (`guest`, `0`, `null`, etc.). Se precisar resetar a identidade, deixe o header vazio para que o backend gere um novo UUID automaticamente.

## Checklist de validação
- [ ] `guestId` e `sessionId` são sempre UUID v4.
- [ ] A query string do SSE contém `guest_id` e `session_id`.
- [ ] Requisições JSON carregam `X-Eco-Guest-Id` e `X-Eco-Session-Id`.
- [ ] Nenhum header/cookie envia valores com prefixos inesperados (o backend aceita `guest_` mas não strings arbitrárias).

Após aplicar o fluxo acima, reproduzimos localmente sem mais erros `invalid_guest_id`.
