#!/bin/bash
#
# check-execution-deploy-status.sh
#
# Prints Execution Stack deployment status: last update time, runtime image tag.
# Use after deploy to confirm the stack and image are updated.
#
# Usage:
#   ./scripts/check-execution-deploy-status.sh [dev|prod]
#

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV="${1:-dev}"
SUFFIX=$([[ "$ENV" == "prod" ]] && echo "Prod" || echo "Dev")
STACK_NAME="SlackAI-Execution-${SUFFIX}"
AWS_REGION="${AWS_REGION:-ap-northeast-1}"

echo "=== Execution Stack deploy status (${STACK_NAME}) ==="
aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
  --query 'Stacks[0].{LastUpdated:LastUpdatedTime,Status:StackStatus}' \
  --output table 2>/dev/null || { echo "Stack not found or no access."; exit 1; }

echo ""
echo "Runtime container image tag (from current template):"
aws cloudformation get-template --stack-name "$STACK_NAME" --query 'TemplateBody' --output text 2>/dev/null \
  | grep -o 'ContainerUri.*[a-f0-9]\{64\}' | sed 's/.*://;s/[^a-f0-9].*//' | head -1 || echo "(could not extract)"

echo ""
echo "Tip: If you changed Execution Agent code (e.g. system_prompt.py), run:"
echo "  DEPLOYMENT_ENV=${ENV} ./scripts/deploy-split-stacks.sh --force-rebuild"
echo "Ensure CDK_OUTDIR is set (the script sets it so app.synth() produces cdk.out)."
echo "If the stack still does not update, run from project root and ensure Docker is available for the image build."
