#!/bin/bash

# ============================================================================
# TEST A1: Feedback Endpoint + Database Inserts Verification
# ============================================================================
# This script tests the complete feedback flow:
# 1. Create a conversation (POST /api/ask-eco)
# 2. Submit feedback (POST /api/feedback)
# 3. Verify database inserts (SQL queries)
# ============================================================================

set -e

# Configuration
API_URL="${API_URL:-http://localhost:3001}"
SUPABASE_URL="${SUPABASE_URL:-}"
SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}TEST A1: Feedback Endpoint + Database Inserts${NC}"
echo -e "${BLUE}============================================================================${NC}\n"

# Step 1: Create a test message
echo -e "${YELLOW}[STEP 1] Generating a test ECO response...${NC}"
echo "Sending: POST $API_URL/api/ask-eco"
echo "Body: {\"message\": \"Olá, como você está?\", \"client_message_id\": \"test-msg-$(date +%s)\"}"
echo ""

RESPONSE=$(curl -s -X POST "$API_URL/api/ask-eco" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Olá, como você está? Estou sentindo um pouco triste hoje.",
    "client_message_id": "test-msg-'$(date +%s)'"
  }')

# Extract interaction_id from SSE response
echo "Response (raw):"
echo "$RESPONSE" | head -20
echo ""

# Parse SSE events to find interaction_id
INTERACTION_ID=$(echo "$RESPONSE" | grep -oP '(?<="interaction_id":")\w{8}-\w{4}-\w{4}-\w{4}-\w{12}' | head -1)

if [ -z "$INTERACTION_ID" ]; then
  echo -e "${RED}❌ Failed to extract interaction_id from response${NC}"
  echo "Full response:"
  echo "$RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Got interaction_id: $INTERACTION_ID${NC}\n"

# Step 2: Submit feedback (UP vote)
echo -e "${YELLOW}[STEP 2] Submitting UP vote feedback...${NC}"
echo "Sending: POST $API_URL/api/feedback"
echo "Body: {\"interaction_id\": \"$INTERACTION_ID\", \"vote\": \"up\", \"reason\": \"well_structured\"}"
echo ""

FEEDBACK_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/feedback" \
  -H "Content-Type: application/json" \
  -d '{
    "interaction_id": "'$INTERACTION_ID'",
    "vote": "up",
    "reason": "well_structured",
    "pillar": "clarity"
  }')

HTTP_CODE=$(echo "$FEEDBACK_RESPONSE" | tail -1)
FEEDBACK_BODY=$(echo "$FEEDBACK_RESPONSE" | head -n-1)

echo "Response Code: $HTTP_CODE"
echo "Response Body: $FEEDBACK_BODY"
echo ""

if [ "$HTTP_CODE" != "200" ]; then
  echo -e "${RED}❌ Feedback submission failed (HTTP $HTTP_CODE)${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Feedback submitted successfully${NC}\n"

# Step 3: Submit DOWN vote for same interaction
echo -e "${YELLOW}[STEP 3] Submitting DOWN vote feedback (second test)...${NC}"

# Generate another message for DOWN vote test
echo "Generating second test message..."

RESPONSE2=$(curl -s -X POST "$API_URL/api/ask-eco" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Pode me ajudar com um problema complexo?",
    "client_message_id": "test-msg-'$(date +%s)'"
  }')

INTERACTION_ID_2=$(echo "$RESPONSE2" | grep -oP '(?<="interaction_id":")\w{8}-\w{4}-\w{4}-\w{4}-\w{12}' | head -1)

if [ -z "$INTERACTION_ID_2" ]; then
  echo -e "${RED}❌ Failed to extract second interaction_id${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Got second interaction_id: $INTERACTION_ID_2${NC}"

echo "Sending DOWN vote..."
FEEDBACK_RESPONSE2=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/feedback" \
  -H "Content-Type: application/json" \
  -d '{
    "interaction_id": "'$INTERACTION_ID_2'",
    "vote": "down",
    "reason": "not_helpful",
    "pillar": "relevance"
  }')

HTTP_CODE2=$(echo "$FEEDBACK_RESPONSE2" | tail -1)

if [ "$HTTP_CODE2" != "200" ]; then
  echo -e "${RED}❌ Second feedback submission failed (HTTP $HTTP_CODE2)${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Second feedback submitted successfully${NC}\n"

# Step 4: Database Verification (if credentials provided)
echo -e "${YELLOW}[STEP 4] Database Verification...${NC}"

if [ -z "$SUPABASE_URL" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
  echo -e "${YELLOW}⚠️  Supabase credentials not provided (set SUPABASE_URL and SERVICE_ROLE_KEY)${NC}"
  echo "Skipping database verification."
  echo ""
  echo -e "${YELLOW}To verify manually, run these SQL queries:${NC}"
  echo ""
  echo -e "${BLUE}1. Check eco_feedback table:${NC}"
  echo "   SELECT id, interaction_id, vote, reason, pillar, created_at"
  echo "   FROM analytics.eco_feedback"
  echo "   ORDER BY created_at DESC"
  echo "   LIMIT 5;"
  echo ""
  echo -e "${BLUE}2. Check bandit_rewards table:${NC}"
  echo "   SELECT id, interaction_id, arm, reward, created_at"
  echo "   FROM analytics.bandit_rewards"
  echo "   ORDER BY created_at DESC"
  echo "   LIMIT 5;"
  echo ""
  echo -e "${BLUE}3. Check eco_module_usages:${NC}"
  echo "   SELECT interaction_id, module_key, position, created_at"
  echo "   FROM analytics.eco_module_usages"
  echo "   WHERE interaction_id IN ('$INTERACTION_ID', '$INTERACTION_ID_2')"
  echo "   ORDER BY created_at DESC;"
  echo ""
  exit 0
fi

echo "Querying Supabase for feedback records..."
echo ""

# Query eco_feedback
echo -e "${BLUE}eco_feedback records:${NC}"
curl -s -X GET "$SUPABASE_URL/rest/v1/eco_feedback?order=created_at.desc&limit=5" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" | jq '.[] | {id, interaction_id, vote, reason, created_at}'

echo ""

# Query bandit_rewards
echo -e "${BLUE}bandit_rewards records:${NC}"
curl -s -X GET "$SUPABASE_URL/rest/v1/bandit_rewards?order=created_at.desc&limit=5" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" | jq '.[] | {id, interaction_id, arm, reward, created_at}'

echo ""

echo -e "${GREEN}✓ Test A1 Complete!${NC}\n"
echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}Summary:${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo "Interaction 1: $INTERACTION_ID (UP vote)"
echo "Interaction 2: $INTERACTION_ID_2 (DOWN vote)"
echo ""
echo -e "${GREEN}Next Steps:${NC}"
echo "- Run database queries above to verify inserts"
echo "- Check eco_module_usages to see which modules were used"
echo "- Check if arm inference is working correctly"
echo ""
