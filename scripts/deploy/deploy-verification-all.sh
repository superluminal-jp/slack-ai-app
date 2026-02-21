#!/bin/bash
#
# deploy-verification-all.sh — Deploy verification zone
#
# Usage:
#   export DEPLOYMENT_ENV=dev
#   ./scripts/deploy/deploy-verification-all.sh
#
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
VERIFICATION_CDK="${PROJECT_ROOT}/verification-zones/verification-agent/cdk"
REGISTRY_HELPER="${SCRIPT_DIR}/lib/execution-agent-registry.sh"
# npm workspaces: aws-cdk is hoisted to project root
CDK_CLI="${VERIFICATION_CDK}/node_modules/.bin/cdk"
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

if [[ ! -f "${REGISTRY_HELPER}" ]]; then
    log_error "Missing helper script: ${REGISTRY_HELPER}"
    exit 1
fi
source "${REGISTRY_HELPER}"

log_info "Deploying verification zone (env: ${DEPLOYMENT_ENV})"

for cmd in aws jq; do
    if ! command -v "${cmd}" >/dev/null 2>&1; then
        log_error "${cmd} is required but not installed"
        exit 1
    fi
done

if [[ ! -x "${CDK_CLI}" ]]; then
    log_info "Installing CDK dependencies..."
    npm install --prefix "${PROJECT_ROOT}"
    CDK_CLI="${PROJECT_ROOT}/node_modules/.bin/cdk"
fi

ENV_SUFFIX=$([[ "${DEPLOYMENT_ENV}" == "prod" ]] && echo "Prod" || echo "Dev")
VERIFICATION_STACK="SlackAI-Verification-${ENV_SUFFIX}"

execution_agent_arns_json="$(build_execution_agent_arns_json "${DEPLOYMENT_ENV}" "${AWS_REGION}")"
execution_agent_context=""
if [[ "${execution_agent_arns_json}" == "{}" ]]; then
    log_warning "No execution agent runtime ARNs discovered. Deploying verification with existing config/context only."
else
    execution_agent_context="--context executionAgentArns=${execution_agent_arns_json}"
    log_info "Discovered execution agents for verification registration:"
    echo "${execution_agent_arns_json}" | jq '.'
fi

# Persist discovered map into verification config for reproducibility (when file exists).
VERIFY_CONFIG="${VERIFICATION_CDK}/cdk.config.${DEPLOYMENT_ENV}.json"
if [[ -f "${VERIFY_CONFIG}" && "${execution_agent_arns_json}" != "{}" ]]; then
    tmp_file="$(mktemp)"
    if jq --argjson arns "${execution_agent_arns_json}" '.executionAgentArns = $arns' "${VERIFY_CONFIG}" > "${tmp_file}"; then
        mv "${tmp_file}" "${VERIFY_CONFIG}"
        log_success "Updated verification config: ${VERIFY_CONFIG}"
    else
        rm -f "${tmp_file}"
        log_warning "Could not update ${VERIFY_CONFIG}; proceeding with deploy context override"
    fi
fi

log_info "Deploying stack: ${VERIFICATION_STACK}"
cd "${VERIFICATION_CDK}"
DEPLOYMENT_ENV="${DEPLOYMENT_ENV}" "${CDK_CLI}" deploy "${VERIFICATION_STACK}" \
    --require-approval never \
    --context deploymentEnv="${DEPLOYMENT_ENV}" \
    ${execution_agent_context:+${execution_agent_context}} \
    ${PROFILE_ARGS:+${PROFILE_ARGS}} \
    --region "${AWS_REGION}"

log_success "Verification zone deployed successfully"
