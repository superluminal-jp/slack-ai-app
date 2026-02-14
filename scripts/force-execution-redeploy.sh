#!/bin/bash
#
# force-execution-redeploy.sh
#
# Forces Execution Agent image rebuild and stack update when the normal
# deploy-split-stacks.sh does not update the stack (e.g. CDK not running
# asset build or CloudFormation update).
#
# Uses a single "cdk deploy" with forceExecutionImageRebuild context so that
# synth and deploy run in one pass and the Docker image is built and pushed.
#
# Run this from the project root. Requires: jq, Docker, AWS CLI, Node/npx.
#
# Usage:
#   DEPLOYMENT_ENV=dev ./scripts/force-execution-redeploy.sh
#

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CDK_DIR="${PROJECT_ROOT}/cdk"
DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-dev}"
EXECUTION_STACK_NAME="SlackAI-Execution-$([[ "$DEPLOYMENT_ENV" == "prod" ]] && echo "Prod" || echo "Dev")"

echo "[INFO] Forcing Execution Agent image rebuild and stack update (env=${DEPLOYMENT_ENV})"
echo "[INFO] Single cdk deploy with forceExecutionImageRebuild (synth + Docker build + stack update)."
echo ""

cd "${CDK_DIR}"
rm -rf cdk.out

# Use AWS CDK CLI from node_modules (project's "npx cdk" runs the app, not the CLI)
CDK_CLI="${CDK_DIR}/node_modules/aws-cdk/bin/cdk"
if [[ ! -x "${CDK_CLI}" ]]; then
  echo "[ERROR] AWS CDK CLI not found at ${CDK_CLI}. Run: cd ${CDK_DIR} && npm install"
  exit 1
fi

export CDK_OUTDIR="${CDK_DIR}/cdk.out"
REBUILD_HASH="$(date +%s)"

echo "[INFO] Running: aws-cdk deploy ${EXECUTION_STACK_NAME} with context forceExecutionImageRebuild=${REBUILD_HASH}"
"${CDK_CLI}" deploy "${EXECUTION_STACK_NAME}" \
  --require-approval never \
  --context "deploymentEnv=${DEPLOYMENT_ENV}" \
  --context "forceExecutionImageRebuild=${REBUILD_HASH}"

echo ""
echo "[INFO] Done. Check stack: aws cloudformation describe-stacks --stack-name ${EXECUTION_STACK_NAME} --query 'Stacks[0].LastUpdatedTime'"
