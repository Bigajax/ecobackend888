# Política de CORS da ECO API

## Fluxo resumido
1. **Preflight (`OPTIONS`)** – o navegador envia um OPTIONS automático antes de qualquer `POST` com headers personalizados (ex.: `Authorization`, `X-Guest-Id`, `Accept: text/event-stream`).
   - O middleware global responde com `204` sem exigir autenticação.
   - Cabeçalhos retornados:
     - `Access-Control-Allow-Origin`
     - `Access-Control-Allow-Credentials`
     - `Access-Control-Allow-Methods`
     - `Access-Control-Allow-Headers`
     - `Access-Control-Max-Age`
     - `Access-Control-Expose-Headers`
   - Também registramos um log `http.cors.preflight` contendo método, rota, origin e os cabeçalhos permitidos.
2. **Requisição real** – após um preflight bem-sucedido, o navegador envia o `POST`/`GET` normal com `credentials: include` quando houver autenticação.
   - As respostas das rotas aplicam os mesmos cabeçalhos CORS para permitir uso de cookies ou tokens (`Access-Control-Allow-Credentials: true`).
   - Endpoints de streaming (`/api/ask-eco`) mantêm `Cache-Control: no-cache` e `X-Accel-Buffering: no` para viabilizar SSE.

## Origens permitidas
- `https://ecofrontend888.vercel.app`
- `http://localhost:5173`

Requisições sem header `Origin` (por exemplo via `curl`) também são aceitas.

## Métodos liberados
`GET, POST, PUT, PATCH, DELETE, OPTIONS`

## Cabeçalhos aceitos no preflight
`Content-Type`, `Accept`, `X-Eco-Client-Message-Id`, `X-Eco-Guest-Id`, `X-Eco-Session-Id`, `X-Client-Id`, `Authorization`

Os headers customizados `X-Eco-*` podem ser enviados pelo frontend e são validados pelo backend para identidade e deduplicação de mensagens.
