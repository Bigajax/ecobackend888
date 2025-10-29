#!/usr/bin/env bash
set -euo pipefail

B="https://ecobackend888.onrender.com"
F="https://ecofrontend888.vercel.app"

echo "[OPTIONS]"
curl -sS -i -X OPTIONS "$B/api/ask-eco" \
  -H "Origin: $F" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,x-client-id,x-eco-guest-id,x-eco-session-id" \
  | sed -n '1,20p'

echo
echo "[SSE smoke]"
curl -sS -i -N -H "Accept: text/event-stream" "$B/api/_sse-smoke" \
  | sed -n '1,40p'
