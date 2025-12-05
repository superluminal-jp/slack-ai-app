#!/bin/bash
# Test API Gateway authentication (should fail without IAM auth)
# Usage: ./test-api-gateway-auth.sh

set -e

STACK_NAME=${STACK_NAME:-SlackBedrockStack}
REGION=${AWS_REGION:-ap-northeast-1}
AWS_PROFILE=${AWS_PROFILE:-amplify-admin}

# Export AWS profile for all AWS CLI commands
export AWS_PROFILE

echo "🧪 Testing API Gateway authentication (should fail without IAM auth)"

# Get API Gateway URL
API_URL=$(aws cloudformation describe-stacks \
  --region $REGION \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='ExecutionApiUrl'].OutputValue" \
  --output text)

if [ -z "$API_URL" ]; then
  echo "❌ Error: Could not find ExecutionApiUrl in stack outputs"
  exit 1
fi

# Remove trailing slash if present
API_URL_CLEAN=$(echo "$API_URL" | sed 's|/$||')
ENDPOINT="$API_URL_CLEAN/execute"
echo "🌐 Testing endpoint: $ENDPOINT"
echo ""

# Test without authentication (should return 403)
echo "📤 Sending request without IAM authentication..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{"channel":"C123","text":"test","bot_token":"xoxb-test"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "📥 Response HTTP Code: $HTTP_CODE"
echo "📥 Response Body: $BODY"
echo ""

if [ "$HTTP_CODE" = "403" ]; then
  echo "✅ SUCCESS: API Gateway correctly rejected unauthorized request (403 Forbidden)"
  echo "✅ Authentication is working correctly!"
else
  echo "❌ UNEXPECTED: Expected 403 Forbidden, got $HTTP_CODE"
  echo "⚠️  This might indicate a security issue - API Gateway should require IAM auth"
  exit 1
fi

