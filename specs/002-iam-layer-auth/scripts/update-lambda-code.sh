#!/bin/bash
# Update Lambda function code directly (without full CDK deployment)
# Usage: ./update-lambda-code.sh [function-name]

set -e

FUNCTION_NAME=${1:-}
STACK_NAME=${STACK_NAME:-SlackBedrockStack}
REGION=${AWS_REGION:-ap-northeast-1}
AWS_PROFILE=${AWS_PROFILE:-amplify-admin}

# Export AWS profile for all AWS CLI commands
export AWS_PROFILE

# Get Lambda function name if not provided
if [ -z "$FUNCTION_NAME" ]; then
  echo "📦 Finding Lambda function..."
  FUNCTION_NAME=$(aws lambda list-functions \
    --region $REGION \
    --query "Functions[?contains(FunctionName, 'SlackEventHandler')].FunctionName" \
    --output text | head -1)
fi

if [ -z "$FUNCTION_NAME" ]; then
  echo "❌ Error: Could not find SlackEventHandler Lambda function"
  exit 1
fi

echo "📦 Found Lambda function: $FUNCTION_NAME"
echo "📁 Packaging Lambda code..."

# Create temporary directory for packaging
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Copy Lambda code
LAMBDA_SOURCE_DIR="$(cd "$(dirname "$0")/../../.." && pwd)/lambda/slack-event-handler"
cp -r "$LAMBDA_SOURCE_DIR"/* "$TEMP_DIR/"

# Install dependencies
echo "📦 Installing Python dependencies..."
cd "$TEMP_DIR"
pip install --upgrade pip --quiet
pip install -r requirements.txt -t . --quiet

# Create deployment package
echo "📦 Creating deployment package..."
ZIP_FILE="$TEMP_DIR/deployment.zip"
zip -r "$ZIP_FILE" . -q

# Update Lambda function code
echo "🚀 Updating Lambda function code..."
aws lambda update-function-code \
  --region $REGION \
  --function-name "$FUNCTION_NAME" \
  --zip-file "fileb://$ZIP_FILE" \
  --output json > /dev/null

echo "✅ Lambda function code updated successfully!"
echo ""
echo "⏳ Waiting for function update to complete..."
aws lambda wait function-updated \
  --region $REGION \
  --function-name "$FUNCTION_NAME"

echo "✅ Function update complete!"
echo ""
echo "🧪 Next steps:"
echo "1. Send a Slack message to test"
echo "2. Check logs: ./check-logs.sh --follow"
echo "3. Verify no duplicate responses"

