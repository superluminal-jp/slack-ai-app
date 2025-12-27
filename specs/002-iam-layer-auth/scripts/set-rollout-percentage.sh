#!/bin/bash
# Set API Gateway rollout percentage
# Usage: ./set-rollout-percentage.sh <percentage>
# Example: ./set-rollout-percentage.sh 10  (10% of requests use API Gateway)

set -e

PERCENTAGE=${1:-0}
STACK_NAME=${STACK_NAME:-SlackBedrockStack}
REGION=${AWS_REGION:-ap-northeast-1}
AWS_PROFILE=${AWS_PROFILE:-amplify-admin}

# Export AWS profile for all AWS CLI commands
export AWS_PROFILE

if [ "$PERCENTAGE" -lt 0 ] || [ "$PERCENTAGE" -gt 100 ]; then
  echo "❌ Error: Percentage must be between 0 and 100"
  exit 1
fi

echo "🔧 Setting API Gateway rollout percentage: $PERCENTAGE%"

# Get Lambda function name
LAMBDA_NAME=$(aws lambda list-functions \
  --region $REGION \
  --query "Functions[?contains(FunctionName, 'SlackEventHandler')].FunctionName" \
  --output text | head -1)

if [ -z "$LAMBDA_NAME" ]; then
  echo "❌ Error: Could not find SlackEventHandler Lambda function"
  exit 1
fi

echo "📦 Found Lambda function: $LAMBDA_NAME"

# Get current environment variables
echo "📥 Retrieving current environment variables..."
ENV_VARS=$(aws lambda get-function-configuration \
  --region $REGION \
  --function-name "$LAMBDA_NAME" \
  --query "Environment.Variables" \
  --output json)

# Get API Gateway URL from CloudFormation outputs
echo "📥 Retrieving API Gateway URL..."
API_URL=$(aws cloudformation describe-stacks \
  --region $REGION \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='ExecutionApiUrl'].OutputValue" \
  --output text)

if [ -z "$API_URL" ]; then
  echo "❌ Error: Could not find ExecutionApiUrl in stack outputs"
  exit 1
fi

echo "🌐 API Gateway URL: $API_URL"

# Build new environment variables
# If percentage > 0, disable boolean flag (percentage takes precedence)
USE_API_GATEWAY_FLAG="false"
if [ "$PERCENTAGE" = "100" ]; then
  USE_API_GATEWAY_FLAG="true"
fi

NEW_ENV_VARS=$(echo "$ENV_VARS" | jq \
  --arg use_api "$USE_API_GATEWAY_FLAG" \
  --arg percentage "$PERCENTAGE" \
  --arg api_url "$API_URL" \
  '. + {USE_API_GATEWAY: $use_api, USE_API_GATEWAY_PERCENTAGE: $percentage, EXECUTION_API_URL: $api_url}')

# Convert to AWS CLI format
ENV_STRING=$(echo "$NEW_ENV_VARS" | jq -r 'to_entries | map("\(.key)=\(.value)") | join(",")')

# Update Lambda function
echo "🚀 Updating Lambda function configuration..."
aws lambda update-function-configuration \
  --region $REGION \
  --function-name "$LAMBDA_NAME" \
  --environment "Variables={$ENV_STRING}" \
  --output json > /dev/null

echo "✅ Lambda function updated successfully!"
echo ""
echo "📊 Current configuration:"
aws lambda get-function-configuration \
  --region $REGION \
  --function-name "$LAMBDA_NAME" \
  --query "Environment.Variables.{USE_API_GATEWAY:USE_API_GATEWAY,USE_API_GATEWAY_PERCENTAGE:USE_API_GATEWAY_PERCENTAGE,EXECUTION_API_URL:EXECUTION_API_URL}" \
  --output json | jq '.'

echo ""
if [ "$PERCENTAGE" = "0" ]; then
  echo "ℹ️  API Gateway is disabled (0%) - using direct Lambda invocation"
elif [ "$PERCENTAGE" = "100" ]; then
  echo "✅ API Gateway is enabled for 100% of requests"
else
  echo "📈 API Gateway is enabled for $PERCENTAGE% of requests (gradual rollout)"
fi

echo ""
echo "🧪 Next steps:"
echo "1. Monitor CloudWatch logs for API Gateway invocations"
echo "2. Check error rates and latency"
echo "3. Gradually increase percentage: 10% → 50% → 100%"
echo "4. Use: ./check-logs.sh --follow"

