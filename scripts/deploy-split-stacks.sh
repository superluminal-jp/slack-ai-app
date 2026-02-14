#!/bin/bash
#
# deploy-split-stacks.sh
#
# Deploys the Slack AI application using two independent stacks.
#
# Deploy order (fixed; no Execution stack re-deploy):
#   1. Phase 1: Deploy Execution Stack
#   2. Phase 2: Deploy Verification Stack (receives executionAgentArn from Execution output)
#   3. Phase 2.5: Apply resource policy on Execution Agent Runtime (Control Plane API; not a stack deploy)
#   4. Phase 3: Validate AgentCore runtimes
#
# Cross-stack values: All values passed from Execution to Verification are taken from
# CloudFormation stack outputs via --outputs-file JSON. None are read from config as the
# source of truth during full deploy.
#
# Usage:
#   export DEPLOYMENT_ENV=dev  # or 'prod'
#   ./scripts/deploy-split-stacks.sh [--force-rebuild]
#   --force-rebuild: force Execution Agent container image rebuild (use when tools/code changed)
#
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - SLACK_BOT_TOKEN environment variable set
#   - SLACK_SIGNING_SECRET environment variable set
#   - DEPLOYMENT_ENV environment variable set (dev or prod)
#   - Node.js and npm installed
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ── Configuration ──────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CDK_DIR="${PROJECT_ROOT}/cdk"
CDK_CLI="${CDK_DIR}/node_modules/aws-cdk/bin/cdk"
AWS_REGION="${AWS_REGION:-ap-northeast-1}"
AWS_PROFILE="${AWS_PROFILE:-}"

# Temp files cleaned up on exit
EXEC_OUTPUTS_FILE="$(mktemp)"
VERIFY_OUTPUTS_FILE="$(mktemp)"
cleanup() { rm -f "${EXEC_OUTPUTS_FILE}" "${VERIFY_OUTPUTS_FILE}"; }
trap cleanup EXIT

# Deployment environment
DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-}"
if [[ -z "${DEPLOYMENT_ENV}" ]]; then
    if command -v jq &> /dev/null; then
        DEPLOYMENT_ENV=$(jq -r '.context.deploymentEnv // "dev"' "${CDK_DIR}/cdk.json" 2>/dev/null || echo "dev")
    else
        DEPLOYMENT_ENV="dev"
    fi
    log_warning "DEPLOYMENT_ENV not set. Using default: ${DEPLOYMENT_ENV}"
fi
DEPLOYMENT_ENV=$(echo "${DEPLOYMENT_ENV}" | tr '[:upper:]' '[:lower:]' | xargs)

VALID_ENVIRONMENTS=("dev" "prod")
if [[ ! " ${VALID_ENVIRONMENTS[@]} " =~ " ${DEPLOYMENT_ENV} " ]]; then
    log_error "Invalid deployment environment '${DEPLOYMENT_ENV}'. Must be one of: ${VALID_ENVIRONMENTS[*]}"
    exit 1
fi

# Stack names
ENVIRONMENT_SUFFIX=$([[ "${DEPLOYMENT_ENV}" == "prod" ]] && echo "Prod" || echo "Dev")
EXECUTION_STACK_NAME="${EXECUTION_STACK_NAME:-SlackAI-Execution}-${ENVIRONMENT_SUFFIX}"
VERIFICATION_STACK_NAME="${VERIFICATION_STACK_NAME:-SlackAI-Verification}-${ENVIRONMENT_SUFFIX}"

# ── Helper functions ───────────────────────────────────────────

get_config_value() {
    local key=$1
    local config_file="${CDK_DIR}/cdk.config.${DEPLOYMENT_ENV}.json"
    [[ ! -f "${config_file}" ]] && { echo ""; return; }
    if command -v jq &> /dev/null; then
        jq -r ".\"${key}\" // empty" "${config_file}" 2>/dev/null || echo ""
    else
        grep -o "\"${key}\": \"[^\"]*\"" "${config_file}" 2>/dev/null | sed 's/.*": "\([^"]*\)".*/\1/' || echo ""
    fi
}

profile_args() {
    [[ -n "${AWS_PROFILE}" ]] && echo "--profile ${AWS_PROFILE}" || echo ""
}

get_stack_output() {
    local stack_name=$1 output_key=$2
    aws cloudformation describe-stacks \
        --stack-name "${stack_name}" \
        --region "${AWS_REGION}" \
        $(profile_args) \
        --query "Stacks[0].Outputs[?OutputKey=='${output_key}'].OutputValue" \
        --output text 2>/dev/null || echo ""
}

# Read a value from a CDK --outputs-file JSON.
# Format: { "StackName": { "OutputKey": "value" } }
read_output() {
    local file=$1 stack=$2 key=$3
    jq -r ".\"${stack}\".\"${key}\" // empty" "${file}" 2>/dev/null || echo ""
}

# Extract AgentCore Runtime ID from ARN (arn:...:runtime/Name-xxxxx -> Name-xxxxx)
get_runtime_id() {
    local arn="$1"
    [[ -n "${arn}" ]] && echo "${arn##*/}" || echo ""
}

# Poll AgentCore runtime until it reaches READY (or timeout).
wait_for_agent_ready() {
    local label=$1 runtime_id=$2 max_wait=${3:-120}
    local elapsed=0 interval=10 target="READY"

    log_info "Checking ${label} Runtime status (id: ${runtime_id})..."
    while [[ ${elapsed} -lt ${max_wait} ]]; do
        local status
        status=$(aws bedrock-agentcore-control get-agent-runtime \
            --agent-runtime-id "${runtime_id}" \
            --region "${AWS_REGION}" \
            $(profile_args) \
            --query 'status' --output text 2>/dev/null || echo "UNKNOWN")

        if [[ "${status}" == "${target}" ]]; then
            log_success "${label} Runtime is ${target}"
            return 0
        fi
        log_info "${label} status: ${status}. Waiting ${interval}s... (${elapsed}/${max_wait}s)"
        sleep ${interval}
        elapsed=$((elapsed + interval))
    done

    log_warning "${label} did not reach ${target} within ${max_wait}s. Current: ${status:-UNKNOWN}"
    return 1
}

# ── Prerequisites ──────────────────────────────────────────────

check_prerequisites() {
    log_info "Checking prerequisites..."
    log_info "Deployment environment: ${DEPLOYMENT_ENV}"
    log_info "Execution Stack: ${EXECUTION_STACK_NAME}"
    log_info "Verification Stack: ${VERIFICATION_STACK_NAME}"

    # Load Slack credentials from config if not set as env vars
    if [[ -z "${SLACK_BOT_TOKEN:-}" ]]; then
        SLACK_BOT_TOKEN=$(get_config_value "slackBotToken")
        [[ -n "${SLACK_BOT_TOKEN}" ]] && export SLACK_BOT_TOKEN && log_info "Loaded SLACK_BOT_TOKEN from config"
    fi
    if [[ -z "${SLACK_SIGNING_SECRET:-}" ]]; then
        SLACK_SIGNING_SECRET=$(get_config_value "slackSigningSecret")
        [[ -n "${SLACK_SIGNING_SECRET}" ]] && export SLACK_SIGNING_SECRET && log_info "Loaded SLACK_SIGNING_SECRET from config"
    fi

    [[ -z "${SLACK_BOT_TOKEN:-}" ]]     && log_error "SLACK_BOT_TOKEN is required" && exit 1
    [[ -z "${SLACK_SIGNING_SECRET:-}" ]] && log_error "SLACK_SIGNING_SECRET is required" && exit 1
    command -v aws  &>/dev/null || { log_error "AWS CLI is not installed"; exit 1; }
    command -v node &>/dev/null || { log_error "Node.js is not installed"; exit 1; }
    command -v jq   &>/dev/null || { log_error "jq is required for --outputs-file parsing"; exit 1; }
    [[ -x "${CDK_CLI}" ]]      || { log_error "CDK CLI not found at ${CDK_CLI}. Run: cd ${CDK_DIR} && npm install"; exit 1; }

    log_success "Prerequisites check passed"
}

# ── Copy docs into Execution Agent build context ───────────────

prepare_execution_agent_docs() {
    local docs_src="${PROJECT_ROOT}/docs"
    local agent_dir="${PROJECT_ROOT}/cdk/lib/execution/agent/execution-agent"
    if [[ ! -d "${docs_src}" ]]; then
        log_warning "docs/ not found at ${docs_src}; Execution Agent will not have bundled documentation."
        return 0
    fi
    rm -rf "${agent_dir}/docs"
    cp -r "${docs_src}" "${agent_dir}/docs"
    log_info "Copied docs/ into Execution Agent build context (${agent_dir}/docs)"
}

# ── Phase 1: Deploy Execution Stack ───────────────────────────

deploy_execution_stack() {
    log_info "=========================================="
    log_info "Phase 1: Deploying Execution Stack"
    log_info "=========================================="

    prepare_execution_agent_docs

    local context_args="--context deploymentEnv=${DEPLOYMENT_ENV}"

    # Force container image rebuild if requested
    if [[ -n "${FORCE_EXECUTION_IMAGE_REBUILD:-}" ]] || [[ "${1:-}" == "--force-rebuild" ]]; then
        local rebuild_val="${FORCE_EXECUTION_IMAGE_REBUILD:-$(date +%s)}"
        context_args="${context_args} --context forceExecutionImageRebuild=${rebuild_val}"
        log_info "Forcing Execution Agent image rebuild (extraHash=${rebuild_val})"
        [[ -d "${CDK_DIR}/cdk.out" ]] && rm -rf "${CDK_DIR}/cdk.out" && log_info "Cleared cdk.out for fresh build"
    fi

    log_info "Deploying ${EXECUTION_STACK_NAME}..."
    cd "${CDK_DIR}"
    if ! "${CDK_CLI}" deploy "${EXECUTION_STACK_NAME}" \
        $(profile_args) \
        --require-approval never \
        --outputs-file "${EXEC_OUTPUTS_FILE}" \
        ${context_args}; then
        log_error "Failed to deploy ${EXECUTION_STACK_NAME}"
        exit 1
    fi
    cd "${PROJECT_ROOT}"

    # Read outputs from --outputs-file JSON
    local exec_agent_arn
    exec_agent_arn=$(read_output "${EXEC_OUTPUTS_FILE}" "${EXECUTION_STACK_NAME}" "ExecutionAgentRuntimeArn")

    if [[ -z "${exec_agent_arn}" ]]; then
        log_error "Failed to get ExecutionAgentRuntimeArn from stack outputs"
        exit 1
    fi

    log_success "Execution Stack deployed successfully"
    log_info "Execution Agent Runtime ARN: ${exec_agent_arn}"
    echo "${exec_agent_arn}"
}

# ── Phase 2: Deploy Verification Stack ─────────────────────────

deploy_verification_stack() {
    log_info "=========================================="
    log_info "Phase 2: Deploying Verification Stack"
    log_info "=========================================="

    # Get executionAgentArn from Phase 1 outputs (preferred) or stack output (fallback)
    local exec_agent_arn
    exec_agent_arn=$(read_output "${EXEC_OUTPUTS_FILE}" "${EXECUTION_STACK_NAME}" "ExecutionAgentRuntimeArn")
    if [[ -z "${exec_agent_arn}" ]]; then
        exec_agent_arn=$(get_stack_output "${EXECUTION_STACK_NAME}" "ExecutionAgentRuntimeArn")
    fi

    local context_args="--context deploymentEnv=${DEPLOYMENT_ENV}"
    if [[ -n "${exec_agent_arn}" ]]; then
        context_args="${context_args} --context executionAgentArn=${exec_agent_arn}"
        log_info "Using Execution Agent ARN: ${exec_agent_arn}"
    else
        log_warning "ExecutionAgentRuntimeArn not available. Verification may not have A2A connectivity."
    fi

    log_info "Deploying ${VERIFICATION_STACK_NAME}..."
    cd "${CDK_DIR}"
    if ! "${CDK_CLI}" deploy "${VERIFICATION_STACK_NAME}" \
        $(profile_args) \
        --require-approval never \
        --outputs-file "${VERIFY_OUTPUTS_FILE}" \
        ${context_args}; then
        log_error "Failed to deploy ${VERIFICATION_STACK_NAME}"
        exit 1
    fi
    cd "${PROJECT_ROOT}"

    local function_url
    function_url=$(read_output "${VERIFY_OUTPUTS_FILE}" "${VERIFICATION_STACK_NAME}" "SlackEventHandlerUrl")

    log_success "Verification Stack deployed successfully"
    log_info "Slack Event Handler URL: ${function_url}"
    echo "${function_url}"
}

# ── Phase 2.5: Apply resource policy ──────────────────────────

apply_execution_agent_resource_policy() {
    local exec_agent_arn
    exec_agent_arn=$(read_output "${EXEC_OUTPUTS_FILE}" "${EXECUTION_STACK_NAME}" "ExecutionAgentRuntimeArn")
    [[ -z "${exec_agent_arn}" ]] && return 0

    local account_id
    account_id=$(aws sts get-caller-identity $(profile_args) --query Account --output text 2>/dev/null || echo "")
    [[ -z "${account_id}" ]] && return 0

    local verification_account
    verification_account=$(get_config_value "verificationAccountId")
    [[ -z "${verification_account}" ]] && verification_account="${account_id}"
    local verify_role_arn="arn:aws:iam::${verification_account}:role/${VERIFICATION_STACK_NAME}-ExecutionRole"

    log_info "Applying resource policy (Principal: ${verify_role_arn})"
    if ! python3 "${SCRIPT_DIR}/apply-resource-policy.py" \
        --execution-agent-arn "${exec_agent_arn}" \
        --verification-role-arn "${verify_role_arn}" \
        --account-id "${verification_account}" \
        --region "${AWS_REGION}"; then
        log_warning "Could not apply resource policy (check boto3 install and PutResourcePolicy permissions)"
    else
        log_success "Execution Agent resource policy applied"
    fi
}

# ── Phase 3: Validate AgentCore runtimes ───────────────────────

validate_agentcore() {
    log_info "=========================================="
    log_info "AgentCore Validation"
    log_info "=========================================="

    local exec_agent_arn verify_agent_arn

    # Read from outputs files first, fall back to describe-stacks
    exec_agent_arn=$(read_output "${EXEC_OUTPUTS_FILE}" "${EXECUTION_STACK_NAME}" "ExecutionAgentRuntimeArn")
    [[ -z "${exec_agent_arn}" ]] && exec_agent_arn=$(get_stack_output "${EXECUTION_STACK_NAME}" "ExecutionAgentRuntimeArn")

    verify_agent_arn=$(read_output "${VERIFY_OUTPUTS_FILE}" "${VERIFICATION_STACK_NAME}" "VerificationAgentRuntimeArn")
    [[ -z "${verify_agent_arn}" ]] && verify_agent_arn=$(get_stack_output "${VERIFICATION_STACK_NAME}" "VerificationAgentRuntimeArn")

    local exec_id verify_id
    exec_id=$(get_runtime_id "${exec_agent_arn}")
    verify_id=$(get_runtime_id "${verify_agent_arn}")

    [[ -n "${exec_id}" ]]   && wait_for_agent_ready "Execution Agent" "${exec_id}" 120
    [[ -n "${verify_id}" ]] && wait_for_agent_ready "Verification Agent" "${verify_id}" 120

    log_success "AgentCore validation complete."
}

# ── Summary ────────────────────────────────────────────────────

print_summary() {
    local function_url exec_agent_arn verify_agent_arn

    function_url=$(read_output "${VERIFY_OUTPUTS_FILE}" "${VERIFICATION_STACK_NAME}" "SlackEventHandlerUrl")
    exec_agent_arn=$(read_output "${EXEC_OUTPUTS_FILE}" "${EXECUTION_STACK_NAME}" "ExecutionAgentRuntimeArn")
    verify_agent_arn=$(read_output "${VERIFY_OUTPUTS_FILE}" "${VERIFICATION_STACK_NAME}" "VerificationAgentRuntimeArn")

    # Fall back to describe-stacks if outputs files are empty
    [[ -z "${function_url}" ]]    && function_url=$(get_stack_output "${VERIFICATION_STACK_NAME}" "SlackEventHandlerUrl")
    [[ -z "${exec_agent_arn}" ]]  && exec_agent_arn=$(get_stack_output "${EXECUTION_STACK_NAME}" "ExecutionAgentRuntimeArn")
    [[ -z "${verify_agent_arn}" ]] && verify_agent_arn=$(get_stack_output "${VERIFICATION_STACK_NAME}" "VerificationAgentRuntimeArn")

    echo ""
    log_info "=========================================="
    log_success "Deployment Complete!"
    log_info "=========================================="
    echo ""
    echo "Slack Event Handler URL (for Slack Event Subscriptions):"
    echo "  ${function_url:-N/A}"
    echo ""
    echo "AgentCore (A2A):"
    echo "  Execution Agent ARN:     ${exec_agent_arn:-N/A}"
    echo "  Verification Agent ARN:  ${verify_agent_arn:-N/A}"
    echo ""
    echo "Next steps:"
    echo "  1. Configure Slack app Event Subscriptions with the Function URL above"
    echo "  2. Test by sending a message to your Slack bot"
    echo "  3. Verify AgentCore Agent Cards at /.well-known/agent-card.json"
    echo ""
}

# ── Main ───────────────────────────────────────────────────────

main() {
    log_info "Starting deployment with two independent stacks..."
    echo ""

    check_prerequisites

    # Phase 1: Deploy Execution Stack
    deploy_execution_stack "${1:-}"

    # Phase 2: Deploy Verification Stack
    deploy_verification_stack

    # Phase 2.5: Apply resource policy via Control Plane API
    apply_execution_agent_resource_policy

    # Phase 3: Validate AgentCore runtimes
    validate_agentcore

    print_summary
}

main "$@"
