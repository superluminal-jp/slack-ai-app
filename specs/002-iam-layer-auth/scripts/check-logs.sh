#!/bin/bash
# Check CloudWatch logs for API Gateway invocations
# Usage: ./check-logs.sh [--follow]

set -e

STACK_NAME=${STACK_NAME:-SlackBedrockStack}
REGION=${AWS_REGION:-ap-northeast-1}
AWS_PROFILE=${AWS_PROFILE:-amplify-admin}
FOLLOW=${1:-}

# Export AWS profile for all AWS CLI commands
export AWS_PROFILE

# Get Lambda function name
LAMBDA_NAME=$(aws lambda list-functions \
  --region $REGION \
  --query "Functions[?contains(FunctionName, 'SlackEventHandler')].FunctionName" \
  --output text | head -1)

if [ -z "$LAMBDA_NAME" ]; then
  echo "❌ Error: Could not find SlackEventHandler Lambda function"
  exit 1
fi

LOG_GROUP="/aws/lambda/$LAMBDA_NAME"
echo "📊 Checking logs for: $LOG_GROUP"
echo ""

if [ "$FOLLOW" = "--follow" ]; then
  echo "👀 Following logs (Ctrl+C to stop)..."
  echo ""
  aws logs tail "$LOG_GROUP" \
    --region $REGION \
    --follow \
    --filter-pattern "execution_api"
else
  echo "📥 Recent API Gateway invocations:"
  echo ""
  aws logs filter-log-events \
    --region $REGION \
    --log-group-name "$LOG_GROUP" \
    --filter-pattern "execution_api" \
    --max-items 20 \
    --query "events[*].[timestamp,message]" \
    --output table || echo "No logs found"
  
  echo ""
  echo "💡 Tip: Use --follow flag to tail logs in real-time"
fi

