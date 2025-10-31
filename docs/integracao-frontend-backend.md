# Integração Frontend ↔ Backend

- HEAD em `/api/ask-eco` (e `/api/ask-eco2`, se exposto) agora responde `204` com CORS global (`Access-Control-Allow-Origin`, `Vary: Origin`, métodos `GET,POST,OPTIONS,HEAD`, headers `Content-Type, Accept`, `Access-Control-Max-Age: 86400`).
- Streams SSE de `/api/ask-eco` enviam o comentário inicial `:` seguido de `\n\n`, publicam `event: ready` imediatamente e usam keepalive `:keepalive` a cada 12 s com compressão desativada.
