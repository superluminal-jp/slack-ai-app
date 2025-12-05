#!/bin/bash
# Complete Phase 4 testing for API Gateway IAM authentication
# Usage: ./run-phase4-tests.sh

set -e

STACK_NAME=${STACK_NAME:-SlackBedrockStack}
REGION=${AWS_REGION:-ap-northeast-1}
AWS_PROFILE=${AWS_PROFILE:-amplify-admin}

# Export AWS profile for all AWS CLI commands
export AWS_PROFILE

echo "🧪 Phase 4 Testing: API Gateway IAM Authentication"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to print test result
print_test_result() {
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✅ PASS${NC}: $2"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}❌ FAIL${NC}: $2"
    ((TESTS_FAILED++))
  fi
}

# Get Lambda function name
echo "📦 Finding Lambda function..."
LAMBDA_NAME=$(aws lambda list-functions \
  --region $REGION \
  --query "Functions[?contains(FunctionName, 'SlackEventHandler')].FunctionName" \
  --output text | head -1)

if [ -z "$LAMBDA_NAME" ]; then
  echo -e "${RED}❌ Error: Could not find SlackEventHandler Lambda function${NC}"
  exit 1
fi

echo "✅ Found: $LAMBDA_NAME"
echo ""

# Get API Gateway URL
echo "🌐 Getting API Gateway URL..."
API_URL=$(aws cloudformation describe-stacks \
  --region $REGION \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='ExecutionApiUrl'].OutputValue" \
  --output text)

if [ -z "$API_URL" ]; then
  echo -e "${RED}❌ Error: Could not find ExecutionApiUrl in stack outputs${NC}"
  exit 1
fi

echo "✅ API Gateway URL: $API_URL"
echo ""

# Test T014: Unauthorized access (should fail)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "T014: Testing API Gateway without IAM auth (should return 403)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ENDPOINT="$API_URL/execute"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{"channel":"C123","text":"test","bot_token":"xoxb-test"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "403" ]; then
  print_test_result 0 "Unauthorized request correctly rejected (403 Forbidden)"
  echo "   Response: $BODY"
else
  print_test_result 1 "Expected 403 Forbidden, got $HTTP_CODE"
  echo "   Response: $BODY"
fi
echo ""

# Test T013: Enable feature flag
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "T013: Enabling API Gateway feature flag"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Get current environment variables
ENV_VARS=$(aws lambda get-function-configuration \
  --region $REGION \
  --function-name "$LAMBDA_NAME" \
  --query "Environment.Variables" \
  --output json)

# Build new environment variables
NEW_ENV_VARS=$(echo "$ENV_VARS" | jq --arg use_api "true" --arg api_url "$API_URL" \
  '. + {USE_API_GATEWAY: $use_api, EXECUTION_API_URL: $api_url}')

ENV_STRING=$(echo "$NEW_ENV_VARS" | jq -r 'to_entries | map("\(.key)=\(.value)") | join(",")')

aws lambda update-function-configuration \
  --region $REGION \
  --function-name "$LAMBDA_NAME" \
  --environment "Variables={$ENV_STRING}" \
  --output json > /dev/null

# Verify update
UPDATED_ENV=$(aws lambda get-function-configuration \
  --region $REGION \
  --function-name "$LAMBDA_NAME" \
  --query "Environment.Variables.{USE_API_GATEWAY:USE_API_GATEWAY,EXECUTION_API_URL:EXECUTION_API_URL}" \
  --output json)

USE_API_GATEWAY=$(echo "$UPDATED_ENV" | jq -r '.USE_API_GATEWAY')
EXECUTION_API_URL_CHECK=$(echo "$UPDATED_ENV" | jq -r '.EXECUTION_API_URL')

if [ "$USE_API_GATEWAY" = "true" ] && [ -n "$EXECUTION_API_URL_CHECK" ]; then
  print_test_result 0 "Feature flag enabled successfully"
  echo "   USE_API_GATEWAY: $USE_API_GATEWAY"
  echo "   EXECUTION_API_URL: $EXECUTION_API_URL_CHECK"
else
  print_test_result 1 "Feature flag not set correctly"
fi
echo ""

# Wait for Lambda to be ready
echo "⏳ Waiting for Lambda function to be ready..."
sleep 5

# Test T015: Check logs for API Gateway invocation
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "T015: Checking for API Gateway invocations in logs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${YELLOW}⚠️  Please send a Slack message to the bot now, then press Enter to continue...${NC}"
read -r

LOG_GROUP="/aws/lambda/$LAMBDA_NAME"
echo "📊 Checking logs for API Gateway invocations..."

# Check for execution_api events in last 5 minutes
START_TIME=$(date -u -v-5M +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -d "5 minutes ago" +%Y-%m-%dT%H:%M:%S)
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%S)

LOG_EVENTS=$(aws logs filter-log-events \
  --region $REGION \
  --log-group-name "$LOG_GROUP" \
  --start-time $(($(date -u +%s) - 300))000 \
  --filter-pattern "execution_api" \
  --query "events[*].message" \
  --output text 2>/dev/null || echo "")

if echo "$LOG_EVENTS" | grep -q "execution_api_invocation_started"; then
  print_test_result 0 "API Gateway invocation detected in logs"
  echo "   Found: execution_api_invocation_started"
  
  if echo "$LOG_EVENTS" | grep -q "execution_api_invocation_success"; then
    print_test_result 0 "API Gateway invocation succeeded"
    echo "   Found: execution_api_invocation_success"
  else
    print_test_result 1 "API Gateway invocation started but no success event found"
  fi
else
  print_test_result 1 "No API Gateway invocations found in logs"
  echo -e "${YELLOW}   Tip: Make sure you sent a Slack message after enabling the feature flag${NC}"
fi
echo ""

# Test T016: Verify CloudWatch logs
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "T016: Verifying CloudWatch logs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ERROR_EVENTS=$(aws logs filter-log-events \
  --region $REGION \
  --log-group-name "$LOG_GROUP" \
  --start-time $(($(date -u +%s) - 300))000 \
  --filter-pattern "execution_api_invocation_error" \
  --query "events[*].message" \
  --output text 2>/dev/null || echo "")

if [ -z "$ERROR_EVENTS" ]; then
  print_test_result 0 "No authentication errors in logs"
else
  print_test_result 1 "Authentication errors found in logs"
  echo "   Errors: $ERROR_EVENTS"
fi

# Check for authentication success
SUCCESS_COUNT=$(aws logs filter-log-events \
  --region $REGION \
  --log-group-name "$LOG_GROUP" \
  --start-time $(($(date -u +%s) - 300))000 \
  --filter-pattern "execution_api_invocation_success" \
  --query "events | length(@)" \
  --output text 2>/dev/null || echo "0")

if [ "$SUCCESS_COUNT" -gt 0 ]; then
  print_test_result 0 "Found $SUCCESS_COUNT successful API Gateway invocations"
else
  print_test_result 1 "No successful API Gateway invocations found"
fi
echo ""

# Test T017: Test error handling (fallback)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "T017: Testing error handling and fallback mechanism"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${YELLOW}⚠️  This test will temporarily break the API Gateway URL to test fallback${NC}"
echo "Press Enter to continue or Ctrl+C to skip..."
read -r

# Set invalid URL
INVALID_ENV_VARS=$(echo "$ENV_VARS" | jq --arg invalid_url "https://invalid-url.execute-api.region.amazonaws.com/prod" \
  '.EXECUTION_API_URL = $invalid_url | .USE_API_GATEWAY = "true"')

INVALID_ENV_STRING=$(echo "$INVALID_ENV_VARS" | jq -r 'to_entries | map("\(.key)=\(.value)") | join(",")')

aws lambda update-function-configuration \
  --region $REGION \
  --function-name "$LAMBDA_NAME" \
  --environment "Variables={$INVALID_ENV_STRING}" \
  --output json > /dev/null

echo "✅ Set invalid API Gateway URL"
echo -e "${YELLOW}⚠️  Please send a Slack message to the bot now, then press Enter to continue...${NC}"
read -r

sleep 3

# Check for fallback
FALLBACK_EVENTS=$(aws logs filter-log-events \
  --region $REGION \
  --log-group-name "$LOG_GROUP" \
  --start-time $(($(date -u +%s) - 60))000 \
  --filter-pattern "fallback_to_lambda_invocation" \
  --query "events[*].message" \
  --output text 2>/dev/null || echo "")

if echo "$FALLBACK_EVENTS" | grep -q "fallback_to_lambda_invocation"; then
  print_test_result 0 "Fallback to Lambda invocation working"
  echo "   Found: fallback_to_lambda_invocation"
else
  print_test_result 1 "Fallback mechanism not triggered"
  echo -e "${YELLOW}   Note: Fallback may not trigger if error handling catches it differently${NC}"
fi

# Restore correct URL
echo ""
echo "🔄 Restoring correct API Gateway URL..."
CORRECT_ENV_VARS=$(echo "$ENV_VARS" | jq --arg api_url "$API_URL" \
  '.EXECUTION_API_URL = $api_url | .USE_API_GATEWAY = "true"')

CORRECT_ENV_STRING=$(echo "$CORRECT_ENV_VARS" | jq -r 'to_entries | map("\(.key)=\(.value)") | join(",")')

aws lambda update-function-configuration \
  --region $REGION \
  --function-name "$LAMBDA_NAME" \
  --environment "Variables={$CORRECT_ENV_STRING}" \
  --output json > /dev/null

print_test_result 0 "API Gateway URL restored"
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Phase 4 Testing Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ Phase 4 Testing Complete!${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Proceed to Phase 5: Gradual Production Rollout"
  echo "2. Use: ./set-rollout-percentage.sh 10"
  echo "3. Monitor: ./monitor-metrics.sh"
else
  echo -e "${YELLOW}⚠️  Some tests failed. Please review the output above.${NC}"
  echo ""
  echo "Common issues:"
  echo "- Make sure you sent Slack messages during testing"
  echo "- Check CloudWatch logs manually: ./check-logs.sh"
  echo "- Verify API Gateway URL is correct"
fi

