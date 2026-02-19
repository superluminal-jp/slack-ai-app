#!/bin/bash
#
# deploy.sh — Deploy Execution Agent zone
#
# Usage:
#   export DEPLOYMENT_ENV=dev
#   ./scripts/deploy.sh [--force-rebuild]
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
# npm workspaces: aws-cdk is hoisted to project root
CDK_CLI="${CDK_DIR}/node_modules/.bin/cdk"
if [[ ! -x "${CDK_CLI}" ]]; then
    CDK_CLI="${PROJECT_ROOT}/node_modules/.bin/cdk"
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

log_info "Deploying Execution Agent zone (env: ${DEPLOYMENT_ENV})"

if [[ ! -x "${CDK_CLI}" ]]; then
    log_info "Installing CDK dependencies..."
    npm install --prefix "${PROJECT_ROOT}"
    CDK_CLI="${PROJECT_ROOT}/node_modules/.bin/cdk"
fi

CONTEXT_ARGS="--context deploymentEnv=${DEPLOYMENT_ENV}"
if [[ "${FORCE_REBUILD}" == "true" ]]; then
    CONTEXT_ARGS="${CONTEXT_ARGS} --context forceExecutionImageRebuild=$(date +%s)"
    log_info "Force image rebuild enabled"
fi

ENV_SUFFIX=$([[ "${DEPLOYMENT_ENV}" == "prod" ]] && echo "Prod" || echo "Dev")
EXEC_STACK="SlackAI-Execution-${ENV_SUFFIX}"

log_info "Deploying stack: ${EXEC_STACK}"
cd "${CDK_DIR}"
DEPLOYMENT_ENV="${DEPLOYMENT_ENV}" "${CDK_CLI}" deploy "${EXEC_STACK}" \
    --require-approval never \
    ${CONTEXT_ARGS} \
    ${PROFILE_ARGS:+${PROFILE_ARGS}} \
    --region "${AWS_REGION}"

log_success "Execution Agent zone deployed successfully"
