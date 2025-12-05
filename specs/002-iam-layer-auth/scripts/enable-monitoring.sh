#!/bin/bash
# Enable API Gateway monitoring (CloudWatch dashboard and alarms)
# Usage: ./enable-monitoring.sh [email]
# Example: ./enable-monitoring.sh admin@example.com

set -e

ALARM_EMAIL=${1:-}
STACK_NAME=${STACK_NAME:-SlackBedrockStack}
REGION=${AWS_REGION:-ap-northeast-1}
AWS_PROFILE=${AWS_PROFILE:-amplify-admin}

# Export AWS profile for all AWS CLI commands
export AWS_PROFILE

echo "📊 Enabling API Gateway monitoring..."

if [ -z "$ALARM_EMAIL" ]; then
  echo "⚠️  No email provided - alarms will be created but no SNS subscription"
  echo "💡 To enable email notifications, run: ./enable-monitoring.sh your-email@example.com"
fi

echo "🚀 Deploying stack with monitoring enabled..."
echo ""

cd "$(dirname "$0")/../../.."

# Deploy with monitoring enabled
export ENABLE_API_GATEWAY_MONITORING=true
if [ -n "$ALARM_EMAIL" ]; then
  export ALARM_EMAIL
fi

cd cdk
npx cdk deploy --profile amplify-admin --require-approval never

echo ""
echo "✅ Monitoring enabled successfully!"
echo ""

# Get dashboard URL
DASHBOARD_URL=$(aws cloudformation describe-stacks \
  --region $REGION \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='MonitoringDashboardUrl'].OutputValue" \
  --output text 2>/dev/null || echo "")

if [ -n "$DASHBOARD_URL" ]; then
  echo "📊 CloudWatch Dashboard:"
  echo "   $DASHBOARD_URL"
  echo ""
fi

echo "📈 CloudWatch Alarms Created:"
echo "   - Authentication failures (4XX errors)"
echo "   - High latency (IntegrationLatency p95 > 500ms)"
echo ""

if [ -n "$ALARM_EMAIL" ]; then
  echo "📧 Email notifications enabled for: $ALARM_EMAIL"
  echo "   ⚠️  Check your email and confirm SNS subscription"
else
  echo "💡 To enable email notifications, redeploy with email:"
  echo "   ./enable-monitoring.sh your-email@example.com"
fi

echo ""
echo "🧪 Next steps:"
echo "1. View dashboard: $DASHBOARD_URL"
echo "2. Check alarms: aws cloudwatch describe-alarms --alarm-name-prefix $STACK_NAME-api-gateway"
echo "3. Monitor metrics: ./monitor-metrics.sh 10"

