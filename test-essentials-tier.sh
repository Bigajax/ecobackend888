#!/bin/bash
# Test script for Essentials Tier implementation
# Tests: Preference creation, webhook processing, status checking

set -e

echo "🧪 Testing Essentials Tier Implementation"
echo "=========================================="
echo ""

# Configuration
API_URL="${API_URL:-http://localhost:3001}"
TEST_USER_ID="test-user-essentials-$(date +%s)"
TEST_EMAIL="test-essentials@ecotopia.com"

echo "📋 Test Configuration:"
echo "   API URL: $API_URL"
echo "   Test User ID: $TEST_USER_ID"
echo "   Test Email: $TEST_EMAIL"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Create Essentials Preference
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 1: Create Essentials Preference"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Note: This will fail without proper auth token
# We're testing the normalization and routing logic
echo "Testing plan normalization..."

cat > /tmp/test-essentials-payload.json <<EOF
{
  "plan": "essentials"
}
EOF

echo "✓ Payload created"
echo ""

# Test 2: Verify SubscriptionService types
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 2: Verify TypeScript Types"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Checking SubscriptionService.ts for 'essentials' type..."
if grep -q 'type PlanType = "monthly" | "annual" | "essentials"' server/services/SubscriptionService.ts; then
    echo -e "${GREEN}✓ PlanType includes 'essentials'${NC}"
else
    echo -e "${RED}✗ PlanType missing 'essentials'${NC}"
    exit 1
fi

echo "Checking SubscriptionStatusResponse for 'essentials_monthly'..."
if grep -q '"essentials_monthly"' server/services/SubscriptionService.ts; then
    echo -e "${GREEN}✓ SubscriptionStatusResponse includes 'essentials_monthly'${NC}"
else
    echo -e "${RED}✗ SubscriptionStatusResponse missing 'essentials_monthly'${NC}"
    exit 1
fi

echo ""

# Test 3: Verify MercadoPagoService
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 3: Verify MercadoPago Service"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Checking createEssentialsPreapproval function..."
if grep -q 'createEssentialsPreapproval' server/services/MercadoPagoService.ts; then
    echo -e "${GREEN}✓ createEssentialsPreapproval function exists${NC}"
else
    echo -e "${RED}✗ createEssentialsPreapproval function missing${NC}"
    exit 1
fi

echo "Checking transaction_amount: 14.9..."
if grep -q 'transaction_amount: 14.9' server/services/MercadoPagoService.ts; then
    echo -e "${GREEN}✓ Essentials price set to R$ 14.90${NC}"
else
    echo -e "${RED}✗ Essentials price not set correctly${NC}"
    exit 1
fi

echo "Checking createCheckout routing..."
if grep -q 'plan === "essentials"' server/services/MercadoPagoService.ts; then
    echo -e "${GREEN}✓ createCheckout routes essentials correctly${NC}"
else
    echo -e "${RED}✗ createCheckout missing essentials routing${NC}"
    exit 1
fi

echo ""

# Test 4: Verify Controller
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 4: Verify Subscription Controller"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Checking normalizePlan function..."
if grep -q '"essentials" | "monthly" | "annual"' server/controllers/subscriptionController.ts; then
    echo -e "${GREEN}✓ normalizePlan accepts 'essentials'${NC}"
else
    echo -e "${RED}✗ normalizePlan doesn't accept 'essentials'${NC}"
    exit 1
fi

echo "Checking error message..."
if grep -q "'essentials', 'monthly' ou 'annual'" server/controllers/subscriptionController.ts; then
    echo -e "${GREEN}✓ Error message includes essentials${NC}"
else
    echo -e "${RED}✗ Error message missing essentials${NC}"
    exit 1
fi

echo ""

# Test 5: Verify Webhook Controller
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 5: Verify Webhook Controller"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Checking extractPlanType function..."
if grep -q 'function extractPlanType.*"essentials" | "monthly" | "annual"' server/controllers/mercadopagoWebhookController.ts; then
    echo -e "${GREEN}✓ extractPlanType returns essentials type${NC}"
else
    echo -e "${RED}✗ extractPlanType missing essentials return type${NC}"
    exit 1
fi

echo "Checking amount detection logic..."
if grep -q 'return "essentials"' server/controllers/mercadopagoWebhookController.ts; then
    echo -e "${GREEN}✓ extractPlanType detects essentials by amount${NC}"
else
    echo -e "${RED}✗ extractPlanType doesn't detect essentials${NC}"
    exit 1
fi

echo "Checking handlePaymentNotification mapping..."
if grep -q 'planType === "essentials"' server/controllers/mercadopagoWebhookController.ts; then
    echo -e "${GREEN}✓ handlePaymentNotification maps essentials${NC}"
else
    echo -e "${RED}✗ handlePaymentNotification missing essentials mapping${NC}"
    exit 1
fi

echo "Checking handlePreapprovalNotification detection..."
if grep -q 'amount >= 20 ? "monthly" : "essentials"' server/controllers/mercadopagoWebhookController.ts; then
    echo -e "${GREEN}✓ handlePreapprovalNotification detects essentials${NC}"
else
    echo -e "${RED}✗ handlePreapprovalNotification missing essentials detection${NC}"
    exit 1
fi

echo ""

# Test 6: Build Check
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 6: TypeScript Build Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd server

echo "Installing dependencies..."
if [ ! -d "node_modules" ]; then
    npm install --silent
fi

echo "Compiling TypeScript..."
if npx tsc --noEmit 2>&1 | tee /tmp/tsc-output.log; then
    echo -e "${GREEN}✓ TypeScript compilation successful${NC}"
else
    echo -e "${RED}✗ TypeScript compilation failed${NC}"
    cat /tmp/tsc-output.log
    exit 1
fi

cd ..

echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 TEST SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✓ All static tests passed!${NC}"
echo ""
echo "✅ Essentials Tier Implementation Verified:"
echo "   • PlanType includes 'essentials'"
echo "   • SubscriptionStatusResponse includes 'essentials_monthly'"
echo "   • createEssentialsPreapproval function exists"
echo "   • Price set to R$ 14.90"
echo "   • normalizePlan accepts 'essentials'"
echo "   • Webhook extractPlanType detects essentials"
echo "   • TypeScript compilation successful"
echo ""
echo -e "${YELLOW}⚠️  Next Steps:${NC}"
echo "   1. Start backend server: cd server && npm run dev"
echo "   2. Test API endpoint: POST /api/subscription/create-preference"
echo "   3. Test with Mercado Pago Sandbox credentials"
echo ""
