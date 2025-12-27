#!/bin/bash
# Enable API Gateway feature flag for testing
# Usage: ./enable-api-gateway.sh [true|false]

set -e

ENABLE=${1:-true}
STACK_NAME=${STACK_NAME:-SlackBedrockStack}
REGION=${AWS_REGION:-ap-northeast-1}
AWS_PROFILE=${AWS_PROFILE:-amplify-admin}

# Export AWS profile for all AWS CLI commands
export AWS_PROFILE

echo "🔧 Enabling API Gateway feature flag: $ENABLE"

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
NEW_ENV_VARS=$(echo "$ENV_VARS" | jq --arg use_api "$ENABLE" --arg api_url "$API_URL" \
  '. + {USE_API_GATEWAY: $use_api, EXECUTION_API_URL: $api_url}')

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
  --query "Environment.Variables.{USE_API_GATEWAY:USE_API_GATEWAY,EXECUTION_API_URL:EXECUTION_API_URL}" \
  --output json | jq '.'

echo ""
echo "🧪 Next steps:"
echo "1. Send a Slack message to test the bot"
echo "2. Check CloudWatch logs: aws logs tail /aws/lambda/$LAMBDA_NAME --follow --filter-pattern 'execution_api'"
echo "3. Verify logs show 'execution_api_invocation_success'"

