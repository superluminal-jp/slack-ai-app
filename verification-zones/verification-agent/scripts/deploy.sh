#!/bin/bash
#
# deploy.sh — Deploy Verification Agent zone only
#
# Usage:
#   export DEPLOYMENT_ENV=dev
#   ./scripts/deploy.sh [--force-rebuild]
#
# Environment variables:
#   DEPLOYMENT_ENV              dev or prod (required)
#   AWS_REGION                  Default: ap-northeast-1
#   AWS_PROFILE                 AWS CLI profile (optional)
#   SLACK_BOT_TOKEN             Required (or set in cdk.config.{env}.json)
#   SLACK_SIGNING_SECRET        Required (or set in cdk.config.{env}.json)
#
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZONE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CDK_DIR="${ZONE_ROOT}/cdk"
PROJECT_ROOT="$(cd "${ZONE_ROOT}/../.." && pwd)"

# CDK CLI: prefer zone-local, fall back to workspace root
CDK_CLI="${CDK_DIR}/node_modules/.bin/cdk"
if [[ ! -x "${CDK_CLI}" ]]; then
    CDK_CLI="${PROJECT_ROOT}/node_modules/aws-cdk/bin/cdk"
fi

AWS_REGION="${AWS_REGION:-ap-northeast-1}"
PROFILE_ARGS="${AWS_PROFILE:+--profile ${AWS_PROFILE}}"

DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-}"
if [[ -z "${DEPLOYMENT_ENV}" ]]; then
    DEPLOYMENT_ENV="dev"
    log_warning "DEPLOYMENT_ENV not set. Using default: ${DEPLOYMENT_ENV}"
fi

FORCE_REBUILD=false
for arg in "$@"; do
    [[ "${arg}" == "--force-rebuild" ]] && FORCE_REBUILD=true
done

# Load Slack credentials from config if not set as env vars
CONFIG_FILE="${CDK_DIR}/cdk.config.${DEPLOYMENT_ENV}.json"
if [[ -z "${SLACK_BOT_TOKEN:-}" && -f "${CONFIG_FILE}" ]]; then
    SLACK_BOT_TOKEN=$(jq -r '.slackBotToken // empty' "${CONFIG_FILE}" 2>/dev/null || echo "")
    [[ -n "${SLACK_BOT_TOKEN}" ]] && export SLACK_BOT_TOKEN && log_info "Loaded SLACK_BOT_TOKEN from config"
fi
if [[ -z "${SLACK_SIGNING_SECRET:-}" && -f "${CONFIG_FILE}" ]]; then
    SLACK_SIGNING_SECRET=$(jq -r '.slackSigningSecret // empty' "${CONFIG_FILE}" 2>/dev/null || echo "")
    [[ -n "${SLACK_SIGNING_SECRET}" ]] && export SLACK_SIGNING_SECRET && log_info "Loaded SLACK_SIGNING_SECRET from config"
fi

[[ -z "${SLACK_BOT_TOKEN:-}" ]]     && { log_error "SLACK_BOT_TOKEN is required"; exit 1; }
[[ -z "${SLACK_SIGNING_SECRET:-}" ]] && { log_error "SLACK_SIGNING_SECRET is required"; exit 1; }

if [[ ! -x "${CDK_CLI}" ]]; then
    log_info "Installing CDK dependencies..."
    npm install --prefix "${PROJECT_ROOT}"
    CDK_CLI="${CDK_DIR}/node_modules/.bin/cdk"
fi

if [[ ! -d "${PROJECT_ROOT}/node_modules" ]]; then
    log_info "Installing workspace dependencies..."
    npm install --prefix "${PROJECT_ROOT}"
fi

ENV_SUFFIX=$([[ "${DEPLOYMENT_ENV}" == "prod" ]] && echo "Prod" || echo "Dev")
VERIFY_STACK="SlackAI-Verification-${ENV_SUFFIX}"

CONTEXT_ARGS="--context deploymentEnv=${DEPLOYMENT_ENV}"
if [[ "${FORCE_REBUILD}" == "true" ]]; then
    CONTEXT_ARGS="${CONTEXT_ARGS} --context forceVerificationImageRebuild=$(date +%s)"
    log_info "Force image rebuild enabled"
fi
log_info "Deploying Verification Agent zone (env: ${DEPLOYMENT_ENV}, stack: ${VERIFY_STACK})"

OUTPUTS_FILE="$(mktemp)"
trap "rm -f '${OUTPUTS_FILE}'" EXIT

cd "${CDK_DIR}"
DEPLOYMENT_ENV="${DEPLOYMENT_ENV}" "${CDK_CLI}" deploy "${VERIFY_STACK}" \
    --require-approval never --force \
    --outputs-file "${OUTPUTS_FILE}" \
    ${CONTEXT_ARGS} \
    ${PROFILE_ARGS:+${PROFILE_ARGS}} \
    --region "${AWS_REGION}"

# Print key outputs
HANDLER_URL=$(jq -r ".\"${VERIFY_STACK}\".SlackEventHandlerUrl // .\"${VERIFY_STACK}\".SlackEventHandlerApiGatewayUrl // empty" "${OUTPUTS_FILE}" 2>/dev/null || echo "")
VERIFY_ARN=$(jq -r ".\"${VERIFY_STACK}\".VerificationAgentRuntimeArn // empty" "${OUTPUTS_FILE}" 2>/dev/null || echo "")

echo ""
log_success "========== Verification Agent deployed successfully =========="
echo ""
[[ -n "${HANDLER_URL}" ]]  && echo "  Slack Event Handler URL: ${HANDLER_URL}"
[[ -n "${VERIFY_ARN}" ]]   && echo "  Verification Agent ARN:  ${VERIFY_ARN}"
echo ""
if [[ -n "${HANDLER_URL}" ]]; then
    echo "Next step: set this URL as the Slack Event Subscriptions Request URL in your Slack app."
fi
