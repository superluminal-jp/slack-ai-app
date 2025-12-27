#!/bin/bash
# Check CloudTrail logs for API Gateway calls
# Usage: ./check-cloudtrail.sh [hours]
# Example: ./check-cloudtrail.sh 1  (last 1 hour)

set -e

HOURS=${1:-1}
STACK_NAME=${STACK_NAME:-SlackBedrockStack}
REGION=${AWS_REGION:-ap-northeast-1}
AWS_PROFILE=${AWS_PROFILE:-amplify-admin}

# Export AWS profile for all AWS CLI commands
export AWS_PROFILE

echo "🔍 Checking CloudTrail logs for API Gateway calls (last $HOURS hour(s))..."
echo ""

# Calculate time range
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%S)
START_TIME=$(date -u -v-${HOURS}H +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -d "$HOURS hours ago" +%Y-%m-%dT%H:%M:%S)

# Get API Gateway ID
API_ID=$(aws apigateway get-rest-apis \
  --region $REGION \
  --query "items[?name=='Execution Layer API'].id" \
  --output text)

if [ -z "$API_ID" ]; then
  echo "❌ Error: Could not find Execution Layer API"
  exit 1
fi

echo "🌐 API Gateway ID: $API_ID"
echo "⏰ Time range: $START_TIME to $END_TIME"
echo ""

# Check CloudTrail events
echo "📊 CloudTrail Events (API Gateway calls):"
echo ""

aws cloudtrail lookup-events \
  --region $REGION \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=$API_ID \
  --start-time "$START_TIME" \
  --end-time "$END_TIME" \
  --max-results 50 \
  --query "Events[*].[EventTime,EventName,Username,Resources[0].ResourceName]" \
  --output table 2>&1 || echo "⚠️  CloudTrail may not be enabled or no events found"

echo ""
echo "💡 Tips:"
echo "- CloudTrail logs API Gateway management actions (not individual API calls)"
echo "- For API call logs, check CloudWatch Logs: ./check-logs.sh"
echo "- To enable CloudTrail: aws cloudtrail create-trail --name <trail-name> --s3-bucket-name <bucket>"

