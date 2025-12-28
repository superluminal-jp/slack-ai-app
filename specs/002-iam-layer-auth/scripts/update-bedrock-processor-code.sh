#!/bin/bash
# Update Bedrock Processor Lambda function code directly
# Usage: ./update-bedrock-processor-code.sh [function-name]

set -e

FUNCTION_NAME=${1:-}
STACK_NAME=${STACK_NAME:-SlackBedrockStack}
REGION=${AWS_REGION:-ap-northeast-1}
AWS_PROFILE=${AWS_PROFILE:-amplify-admin}

# Export AWS profile for all AWS CLI commands
export AWS_PROFILE

# Get Lambda function name if not provided
if [ -z "$FUNCTION_NAME" ]; then
  echo "📦 Finding Bedrock Processor Lambda function..."
  FUNCTION_NAME=$(aws lambda list-functions \
    --region $REGION \
    --query "Functions[?contains(FunctionName, 'BedrockProcessor')].FunctionName" \
    --output text | head -1)
fi

if [ -z "$FUNCTION_NAME" ]; then
  echo "❌ Error: Could not find BedrockProcessor Lambda function"
  exit 1
fi

echo "📦 Found Lambda function: $FUNCTION_NAME"
echo "📁 Packaging Lambda code..."

# Create temporary directory for packaging
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Copy Lambda code
LAMBDA_SOURCE_DIR="$(cd "$(dirname "$0")/../../.." && pwd)/cdk/lib/execution/lambda/bedrock-processor"
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
echo "📝 Note: Bedrock Processor now returns 202 (Accepted) instead of 200 (OK)"
echo "   This is the correct status code for async operations."

