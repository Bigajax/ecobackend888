#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3000}"

echo "==> POST /api/feedback"
curl -i -X POST "$API_URL/api/feedback" \
  -H "Content-Type: application/json" \
  -H "X-Eco-Guest-Id: TEST-GUEST" \
  -d '{"interaction_id":"00000000-0000-0000-0000-000000000001","vote":"up","reason":"ajudou","source":"chat_ui"}'

echo

echo "==> POST /api/interaction"
curl -i -X POST "$API_URL/api/interaction" \
  -H "Content-Type: application/json" \
  -d '{"interaction_id":"00000000-0000-0000-0000-000000000002","module_combo":["IDENTIDADE"],"tokens_in":10,"tokens_out":20}'

echo

echo "==> POST /api/latency"
curl -i -X POST "$API_URL/api/latency" \
  -H "Content-Type: application/json" \
  -d '{"response_id":"00000000-0000-0000-0000-000000000003","ttfb_ms":120,"ttlc_ms":450,"tokens_total":64}'
