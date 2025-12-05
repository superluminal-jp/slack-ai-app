#!/bin/bash
# Monitor API Gateway metrics for gradual rollout
# Usage: ./monitor-metrics.sh [duration_minutes]

set -e

DURATION=${1:-5}
STACK_NAME=${STACK_NAME:-SlackBedrockStack}
REGION=${AWS_REGION:-ap-northeast-1}
AWS_PROFILE=${AWS_PROFILE:-amplify-admin}

# Export AWS profile for all AWS CLI commands
export AWS_PROFILE

echo "📊 Monitoring API Gateway metrics for $DURATION minutes..."
echo ""

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
echo ""

# Calculate time range
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%S)
START_TIME=$(date -u -v-${DURATION}M +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -d "$DURATION minutes ago" +%Y-%m-%dT%H:%M:%S)

echo "⏰ Time range: $START_TIME to $END_TIME"
echo ""

# Get metrics
echo "📈 Request Count:"
aws cloudwatch get-metric-statistics \
  --region $REGION \
  --namespace AWS/ApiGateway \
  --metric-name Count \
  --dimensions Name=ApiName,Value="Execution Layer API" \
  --start-time "$START_TIME" \
  --end-time "$END_TIME" \
  --period 60 \
  --statistics Sum \
  --query "Datapoints[*].[Timestamp,Sum]" \
  --output table || echo "No data"

echo ""
echo "📈 4XX Errors:"
aws cloudwatch get-metric-statistics \
  --region $REGION \
  --namespace AWS/ApiGateway \
  --metric-name 4XXError \
  --dimensions Name=ApiName,Value="Execution Layer API" \
  --start-time "$START_TIME" \
  --end-time "$END_TIME" \
  --period 60 \
  --statistics Sum \
  --query "Datapoints[*].[Timestamp,Sum]" \
  --output table || echo "No data"

echo ""
echo "📈 5XX Errors:"
aws cloudwatch get-metric-statistics \
  --region $REGION \
  --namespace AWS/ApiGateway \
  --metric-name 5XXError \
  --dimensions Name=ApiName,Value="Execution Layer API" \
  --start-time "$START_TIME" \
  --end-time "$END_TIME" \
  --period 60 \
  --statistics Sum \
  --query "Datapoints[*].[Timestamp,Sum]" \
  --output table || echo "No data"

echo ""
echo "📈 Latency (p95):"
aws cloudwatch get-metric-statistics \
  --region $REGION \
  --namespace AWS/ApiGateway \
  --metric-name Latency \
  --dimensions Name=ApiName,Value="Execution Layer API" \
  --start-time "$START_TIME" \
  --end-time "$END_TIME" \
  --period 60 \
  --extended-statistics "p95" \
  --query "Datapoints[*].[Timestamp,ExtendedStatistics.p95]" \
  --output table || echo "No data"

echo ""
echo "📈 Integration Latency (p95):"
aws cloudwatch get-metric-statistics \
  --region $REGION \
  --namespace AWS/ApiGateway \
  --metric-name IntegrationLatency \
  --dimensions Name=ApiName,Value="Execution Layer API" \
  --start-time "$START_TIME" \
  --end-time "$END_TIME" \
  --period 60 \
  --extended-statistics "p95" \
  --query "Datapoints[*].[Timestamp,ExtendedStatistics.p95]" \
  --output table || echo "No data"

echo ""
echo "💡 Tips:"
echo "- Monitor for at least 5-10 minutes after changing rollout percentage"
echo "- Check error rates stay <1%"
echo "- Verify latency increase <5%"
echo "- Use: ./check-logs.sh --follow for detailed logs"

