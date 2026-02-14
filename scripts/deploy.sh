#!/bin/bash
#
# deploy.sh — Unified CLI for Slack AI application deployment and diagnostics
#
# Subcommands:
#   (default)                               Full pipeline: deploy --force-rebuild + status + check-access + logs
#   deploy [--force-rebuild]               Deploy only (no diagnostics)
#   status                                 Stack status + image tag
#   check-access                           A2A authorization troubleshooting
#   logs [--latest|--correlation-id ID]    Request tracing across all stages
#   policy [--dry-run]                     Apply resource policy only
#   help                                   Show usage
#
# Deploy order (fixed; no Execution stack re-deploy):
#   1. Phase 1: Deploy Execution Stack
#   2. Phase 2: Deploy Verification Stack (receives executionAgentArn from Execution output)
#   3. Phase 2.5: Apply resource policy on Execution Agent Runtime (Control Plane API)
#   4. Phase 3: Validate AgentCore runtimes
#
# Usage:
#   export DEPLOYMENT_ENV=dev  # or 'prod'
#   ./scripts/deploy.sh                     # deploy (default)
#   ./scripts/deploy.sh deploy --force-rebuild
#   ./scripts/deploy.sh status
#   ./scripts/deploy.sh check-access
#   ./scripts/deploy.sh logs --latest
#   ./scripts/deploy.sh logs --correlation-id "abc-123"
#   ./scripts/deploy.sh policy --dry-run
#
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - DEPLOYMENT_ENV environment variable set (dev or prod)
#   - For deploy: SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, Node.js, jq
#

set -euo pipefail

# ── Colors & logging ─────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ── Configuration ────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CDK_DIR="${PROJECT_ROOT}/cdk"
CDK_CLI="${CDK_DIR}/node_modules/aws-cdk/bin/cdk"
AWS_REGION="${AWS_REGION:-ap-northeast-1}"
AWS_PROFILE="${AWS_PROFILE:-}"

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

# ── Shared helpers ───────────────────────────────────────────

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

read_output() {
    local file=$1 stack=$2 key=$3
    jq -r ".\"${stack}\".\"${key}\" // empty" "${file}" 2>/dev/null || echo ""
}

get_runtime_id() {
    local arn="$1"
    [[ -n "${arn}" ]] && echo "${arn##*/}" || echo ""
}

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

parse_duration() {
    local d="$1"
    if [[ "$d" =~ ^([0-9]+)([hm]?)$ ]]; then
        local num="${BASH_REMATCH[1]}"
        local unit="${BASH_REMATCH[2]:-s}"
        case "$unit" in
            h) echo $((num * 3600));;
            m) echo $((num * 60));;
            s) echo "$num";;
            *) echo "$num";;
        esac
    else
        echo "3600"
    fi
}

# ── Subcommand: deploy ───────────────────────────────────────

check_prerequisites() {
    log_info "Checking prerequisites..."
    log_info "Deployment environment: ${DEPLOYMENT_ENV}"
    log_info "Execution Stack: ${EXECUTION_STACK_NAME}"
    log_info "Verification Stack: ${VERIFICATION_STACK_NAME}"

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

deploy_execution_stack() {
    log_info "=========================================="
    log_info "Phase 1: Deploying Execution Stack"
    log_info "=========================================="

    prepare_execution_agent_docs

    local context_args="--context deploymentEnv=${DEPLOYMENT_ENV}"

    if [[ -n "${FORCE_EXECUTION_IMAGE_REBUILD:-}" ]] || [[ "${FORCE_REBUILD:-}" == "true" ]]; then
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

deploy_verification_stack() {
    log_info "=========================================="
    log_info "Phase 2: Deploying Verification Stack"
    log_info "=========================================="

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

validate_agentcore() {
    log_info "=========================================="
    log_info "AgentCore Validation"
    log_info "=========================================="

    local exec_agent_arn verify_agent_arn

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

print_summary() {
    local function_url exec_agent_arn verify_agent_arn

    function_url=$(read_output "${VERIFY_OUTPUTS_FILE}" "${VERIFICATION_STACK_NAME}" "SlackEventHandlerUrl")
    exec_agent_arn=$(read_output "${EXEC_OUTPUTS_FILE}" "${EXECUTION_STACK_NAME}" "ExecutionAgentRuntimeArn")
    verify_agent_arn=$(read_output "${VERIFY_OUTPUTS_FILE}" "${VERIFICATION_STACK_NAME}" "VerificationAgentRuntimeArn")

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

cmd_deploy() {
    # Temp files cleaned up on exit
    EXEC_OUTPUTS_FILE="$(mktemp)"
    VERIFY_OUTPUTS_FILE="$(mktemp)"
    cleanup() { rm -f "${EXEC_OUTPUTS_FILE}" "${VERIFY_OUTPUTS_FILE}"; }
    trap cleanup EXIT

    # Parse deploy-specific args
    FORCE_REBUILD="false"
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --force-rebuild) FORCE_REBUILD="true"; shift ;;
            *) log_error "Unknown deploy option: $1"; exit 1 ;;
        esac
    done

    log_info "Starting deployment with two independent stacks..."
    echo ""

    check_prerequisites
    deploy_execution_stack
    deploy_verification_stack
    apply_execution_agent_resource_policy
    validate_agentcore
    print_summary
}

# ── Subcommand: status ───────────────────────────────────────

cmd_status() {
    echo "=== Execution Stack deploy status (${EXECUTION_STACK_NAME}) ==="
    aws cloudformation describe-stacks --stack-name "${EXECUTION_STACK_NAME}" \
        --region "${AWS_REGION}" \
        $(profile_args) \
        --query 'Stacks[0].{LastUpdated:LastUpdatedTime,Status:StackStatus}' \
        --output table 2>/dev/null || { echo "Stack not found or no access."; exit 1; }

    echo ""
    echo "Runtime container image tag (from current template):"
    aws cloudformation get-template --stack-name "${EXECUTION_STACK_NAME}" \
        --region "${AWS_REGION}" \
        $(profile_args) \
        --query 'TemplateBody' --output text 2>/dev/null \
        | grep -o 'ContainerUri.*[a-f0-9]\{64\}' | sed 's/.*://;s/[^a-f0-9].*//' | head -1 || echo "(could not extract)"

    echo ""
    echo "Tip: If you changed Execution Agent code, run:"
    echo "  DEPLOYMENT_ENV=${DEPLOYMENT_ENV} ./scripts/deploy.sh deploy --force-rebuild"
}

# ── Subcommand: check-access ─────────────────────────────────

cmd_check_access() {
    local expected_role="${VERIFICATION_STACK_NAME}-ExecutionRole"

    echo "=============================================="
    echo "Execution アクセス確認 (region=${AWS_REGION}, env=${DEPLOYMENT_ENV})"
    echo "=============================================="

    # --- [1] Execution Agent のリソースポリシー ---
    echo ""
    echo "--- [1] Execution Agent のリソースポリシー（Principal の確認） ---"
    local exec_runtime_arn
    exec_runtime_arn=$(get_stack_output "${EXECUTION_STACK_NAME}" "ExecutionAgentRuntimeArn")
    if [[ -z "${exec_runtime_arn}" || "${exec_runtime_arn}" == "None" ]]; then
        echo "  (スキップ) ${EXECUTION_STACK_NAME} の ExecutionAgentRuntimeArn を取得できませんでした。"
    else
        echo "  Execution Runtime ARN: ${exec_runtime_arn}"
        local policy_json
        policy_json=$(aws bedrock-agentcore-control get-resource-policy $(profile_args) --region "${AWS_REGION}" \
            --resource-arn "${exec_runtime_arn}" 2>/dev/null | jq -r '.policy // empty' || true)
        if [[ -z "${policy_json}" ]]; then
            echo "  (警告) リソースポリシーが取得できませんでした（未設定または GetResourcePolicy 権限不足）。"
            echo "  デプロイスクリプトを実行してリソースポリシーを適用してください:"
            echo "    ./scripts/deploy.sh policy"
            echo "  または:"
            echo "    python3 scripts/apply-resource-policy.py --help"
        else
            echo "  現在のポリシー:"
            echo "${policy_json}" | jq '.' 2>/dev/null || echo "${policy_json}"
            local principal
            principal=$(echo "${policy_json}" | jq -r 'if .Statement[0].Principal.AWS then (.Statement[0].Principal.AWS | if type == "array" then .[0] else . end) else .Statement[0].Principal end' 2>/dev/null || true)
            echo ""
            echo "  Principal: ${principal}"
            if [[ "${principal}" == *"${expected_role}"* ]]; then
                echo "  => OK: Verification の実行ロール (${expected_role}) が許可されています。"
            else
                echo "  => 要確認: 期待するロール名は ${expected_role} です。./scripts/deploy.sh policy を再実行してください。"
            fi
        fi
    fi

    # --- [2] Verification Agent の IAM ポリシー ---
    echo ""
    echo "--- [2] Verification Agent の IAM（Runtime と Endpoint の両方の許可） ---"
    if ! aws iam get-role $(profile_args) --role-name "${expected_role}" &>/dev/null; then
        echo "  (スキップ) IAM ロール ${expected_role} が見つかりません。"
    else
        echo "  ロール: ${expected_role}"
        local inline_policies
        inline_policies=$(aws iam list-role-policies $(profile_args) --role-name "${expected_role}" --query 'PolicyNames' --output text 2>/dev/null || true)
        local found_invoke=0 has_runtime=0 has_endpoint=0
        for pol in ${inline_policies}; do
            local doc
            doc=$(aws iam get-role-policy $(profile_args) --role-name "${expected_role}" --policy-name "${pol}" --query 'PolicyDocument' --output json 2>/dev/null || true)
            if echo "${doc}" | jq -e '.Statement[] | select(.Sid == "AgentCoreInvoke")' &>/dev/null; then
                found_invoke=1
                local resources
                resources=$(echo "${doc}" | jq -r '.Statement[] | select(.Sid == "AgentCoreInvoke") | .Resource' 2>/dev/null)
                echo "${resources}" | grep -q "runtime/" && has_runtime=1
                echo "${resources}" | grep -q "runtime-endpoint/" && has_endpoint=1
                echo "  AgentCoreInvoke の Resource:"
                echo "${doc}" | jq '.Statement[] | select(.Sid == "AgentCoreInvoke") | .Resource' 2>/dev/null || true
                break
            fi
        done
        if [[ ${found_invoke} -eq 0 ]]; then
            echo "  (警告) AgentCoreInvoke のポリシーステートメントが見つかりません。"
        else
            if [[ ${has_runtime} -eq 1 ]] && [[ ${has_endpoint} -eq 1 ]]; then
                echo "  => OK: Runtime と Endpoint の両方の ARN が許可されています。"
            else
                echo "  => 要確認: Runtime または Endpoint のいずれかが不足しています。Verification スタックを再デプロイしてください。"
            fi
        fi
    fi

    # --- [3] Verification Runtime ログの invoke_execution_agent_failed ---
    echo ""
    echo "--- [3] Verification Runtime ログ（invoke_execution_agent_failed） ---"
    local verification_log_prefix="/aws/bedrock-agentcore/runtimes/SlackAI_VerificationAgent_${ENVIRONMENT_SUFFIX}"
    local log_groups
    log_groups=$(aws logs describe-log-groups $(profile_args) --region "${AWS_REGION}" \
        --log-group-name-prefix "${verification_log_prefix}" \
        --query 'logGroups[*].logGroupName' --output text 2>/dev/null || true)
    if [[ -z "${log_groups}" ]]; then
        log_groups=$(aws logs describe-log-groups $(profile_args) --region "${AWS_REGION}" \
            --log-group-name-prefix "/aws/bedrock-agentcore/runtimes/SlackAI_VerificationAgent" \
            --query 'logGroups[*].logGroupName' --output text 2>/dev/null || true)
    fi
    if [[ -z "${log_groups}" ]]; then
        echo "  (スキップ) Verification Agent の Runtime ロググループが見つかりません。"
    else
        for lg in ${log_groups}; do
            [[ "${lg}" != *"VerificationAgent"* ]] && continue
            echo "  Log group: ${lg}"
            aws logs tail "${lg}" $(profile_args) --region "${AWS_REGION}" \
                --since 2h --format short --filter-pattern "invoke_execution_agent_failed" 2>/dev/null | head -25 || true
            echo ""
        done
        echo "  => 上に error_code / error_message が出ていれば、Execution 側の認可または IAM を確認してください。"
    fi

    echo "=============================================="
    echo "確認完了"
    echo "=============================================="
}

# ── Subcommand: logs ─────────────────────────────────────────

cmd_logs() {
    local mode="latest"
    local correlation_id=""
    local since_seconds=3600
    local limit=50

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --latest)           mode="latest"; shift ;;
            --correlation-id)   correlation_id="$2"; mode="correlation-id"; shift 2 ;;
            --list-log-groups)  mode="list"; shift ;;
            --since)            since_seconds=$(parse_duration "$2"); shift 2 ;;
            --limit)            limit="$2"; shift 2 ;;
            *) log_error "Unknown logs option: $1"; exit 1 ;;
        esac
    done

    if [[ "$mode" == "correlation-id" && -z "$correlation_id" ]]; then
        log_error "--correlation-id requires a value"
        exit 1
    fi

    command -v jq &> /dev/null || { log_error "jq is required. Install with: brew install jq"; exit 1; }

    # Discover log groups
    local seh_lg="" ai_lg="" sp_lg="" va_lg="" ea_lg=""

    log_info "Discovering log groups (prefix: ${VERIFICATION_STACK_NAME}, /aws/bedrock-agentcore)..."
    for lg in $(aws logs describe-log-groups \
        --log-group-name-prefix "/aws/lambda/${VERIFICATION_STACK_NAME}" \
        --region "$AWS_REGION" $(profile_args) \
        --query 'logGroups[*].logGroupName' --output text 2>/dev/null || true); do
        [[ -z "$lg" ]] && continue
        [[ "$lg" == *"SlackEventHandler"* ]] && seh_lg="$lg"
        [[ "$lg" == *"AgentInvoker"* ]]      && ai_lg="$lg"
        [[ "$lg" == *"SlackPoster"* ]]        && sp_lg="$lg"
    done
    for lg in $(aws logs describe-log-groups \
        --log-group-name-prefix "/aws/bedrock-agentcore/runtimes" \
        --region "$AWS_REGION" $(profile_args) \
        --query 'logGroups[*].logGroupName' --output text 2>/dev/null || true); do
        [[ -z "$lg" ]] && continue
        [[ "$lg" == *"VerificationAgent"* ]] && [[ "$lg" == *"-DEFAULT" ]] && va_lg="$lg"
        [[ "$lg" == *"ExecutionAgent"* ]]    && [[ "$lg" == *"-DEFAULT" ]] && ea_lg="$lg"
    done

    if [[ "$mode" == "list" ]]; then
        echo -e "${CYAN}Discovered log groups:${NC}"
        echo ""
        echo "Slack Event Handler:  ${seh_lg:-<not found>}"
        echo "Agent Invoker:       ${ai_lg:-<not found>}"
        echo "Slack Poster:         ${sp_lg:-<not found>}"
        echo "Verification Agent:   ${va_lg:-<not found>}"
        echo "Execution Agent:      ${ea_lg:-<not found>}"
        return
    fi

    # Get latest correlation_id
    if [[ "$mode" == "latest" ]]; then
        local start_ms=$(( ($(date +%s) - since_seconds) * 1000 ))

        # Try Slack Event Handler first
        if [[ -n "$seh_lg" ]]; then
            local event
            event=$(aws logs filter-log-events --log-group-name "$seh_lg" \
                --start-time "$start_ms" --filter-pattern "sqs_enqueue_success" \
                --region "$AWS_REGION" $(profile_args) --limit 20 --output json 2>/dev/null \
                | jq -r '.events[-1].message // empty' 2>/dev/null || true)
            [[ -n "$event" ]] && correlation_id=$(echo "$event" | jq -r '.request_id // empty' 2>/dev/null || true)
        fi

        # Fallback: Agent Invoker
        if [[ -z "$correlation_id" && -n "$ai_lg" ]]; then
            local event
            event=$(aws logs filter-log-events --log-group-name "$ai_lg" \
                --start-time "$start_ms" --filter-pattern "?agent_invocation_success ?agent_invocation_failed ?agent_invocation_started" \
                --region "$AWS_REGION" $(profile_args) --limit 20 --output json 2>/dev/null \
                | jq -r '.events[-1].message // empty' 2>/dev/null || true)
            [[ -n "$event" ]] && correlation_id=$(echo "$event" | jq -r '.correlation_id // .request_id // empty' 2>/dev/null || true)
        fi

        # Fallback: Slack Poster
        if [[ -z "$correlation_id" && -n "$sp_lg" ]]; then
            local event
            event=$(aws logs filter-log-events --log-group-name "$sp_lg" \
                --start-time "$start_ms" --filter-pattern "slack_post_started" \
                --region "$AWS_REGION" $(profile_args) --limit 20 --output json 2>/dev/null \
                | jq -r '.events[-1].message // empty' 2>/dev/null || true)
            [[ -n "$event" ]] && correlation_id=$(echo "$event" | jq -r '.correlation_id // empty' 2>/dev/null || true)
        fi

        if [[ -z "$correlation_id" ]]; then
            echo -e "${RED}Error: No Slack request found in the last $((since_seconds/60)) minutes.${NC}" >&2
            echo "Try increasing --since (e.g. --since 2h) or use --list-log-groups to verify log groups." >&2
            exit 1
        fi
        echo -e "${CYAN}Latest correlation_id: ${correlation_id}${NC}"
        echo ""
    fi

    echo -e "${CYAN}=== Slack Request Log Trace (correlation_id: ${correlation_id}) ===${NC}"
    echo ""

    # Fetch logs helper (inline)
    _fetch_logs() {
        local log_group="$1" stage_name="$2" is_agentcore="${3:-}"
        local start_ms=$(( ($(date +%s) - since_seconds) * 1000 ))
        [[ -z "$log_group" ]] && return

        local filter_pattern=""
        [[ -n "$correlation_id" ]] && filter_pattern="\"$correlation_id\""

        local events_json
        if [[ -n "$filter_pattern" ]]; then
            events_json=$(aws logs filter-log-events --log-group-name "$log_group" \
                --start-time "$start_ms" --filter-pattern "$filter_pattern" \
                --region "$AWS_REGION" $(profile_args) --limit "$limit" --output json 2>/dev/null || echo '{"events":[]}')
        else
            events_json=$(aws logs filter-log-events --log-group-name "$log_group" \
                --start-time "$start_ms" --region "$AWS_REGION" $(profile_args) \
                --limit "$limit" --output json 2>/dev/null || echo '{"events":[]}')
        fi

        local count fallback_msg=""
        count=$(echo "$events_json" | jq '.events | length' 2>/dev/null || echo "0")

        # AgentCore: retry without filter when filter returns 0
        if [[ "$count" -eq 0 && "$is_agentcore" == "agentcore" && -n "$filter_pattern" ]]; then
            events_json=$(aws logs filter-log-events --log-group-name "$log_group" \
                --start-time "$start_ms" --region "$AWS_REGION" $(profile_args) \
                --limit "$limit" --output json 2>/dev/null || echo '{"events":[]}')
            count=$(echo "$events_json" | jq '.events | length' 2>/dev/null || echo "0")
            [[ "$count" -gt 0 ]] && fallback_msg=" (No events matched correlation_id; showing recent logs)"
        fi

        if [[ "$count" -eq 0 ]]; then
            echo -e "${YELLOW}[$stage_name]${NC} (log group: $log_group)"
            echo "  No events found."
            echo ""
            return
        fi

        echo -e "${GREEN}[$stage_name]${NC} (log group: $log_group) -- $count event(s)${fallback_msg}"
        echo "---"
        echo "$events_json" | jq -r '.events[] | "\(.timestamp | tonumber / 1000 | strftime("%Y-%m-%d %H:%M:%S")) | \(.message)"' 2>/dev/null | while read -r line; do
            echo "  $line"
        done
        echo ""
    }

    _fetch_logs "$seh_lg" "1. Slack Event Handler"
    _fetch_logs "$ai_lg"  "2. Agent Invoker"
    _fetch_logs "$va_lg"  "3. Verification Agent (AgentCore)" "agentcore"
    _fetch_logs "$ea_lg"  "4. Execution Agent (AgentCore)" "agentcore"
    _fetch_logs "$sp_lg"  "5. Slack Poster"
}

# ── Subcommand: policy ───────────────────────────────────────

cmd_policy() {
    local dry_run=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run) dry_run="--dry-run"; shift ;;
            *) log_error "Unknown policy option: $1"; exit 1 ;;
        esac
    done

    local exec_agent_arn
    exec_agent_arn=$(get_stack_output "${EXECUTION_STACK_NAME}" "ExecutionAgentRuntimeArn")
    if [[ -z "${exec_agent_arn}" ]]; then
        log_error "Failed to get ExecutionAgentRuntimeArn from ${EXECUTION_STACK_NAME}. Is the stack deployed?"
        exit 1
    fi

    local account_id
    account_id=$(aws sts get-caller-identity $(profile_args) --query Account --output text 2>/dev/null || echo "")
    if [[ -z "${account_id}" ]]; then
        log_error "Failed to get AWS account ID. Check credentials."
        exit 1
    fi

    local verification_account
    verification_account=$(get_config_value "verificationAccountId")
    [[ -z "${verification_account}" ]] && verification_account="${account_id}"
    local verify_role_arn="arn:aws:iam::${verification_account}:role/${VERIFICATION_STACK_NAME}-ExecutionRole"

    log_info "Execution Agent ARN: ${exec_agent_arn}"
    log_info "Verification Role:   ${verify_role_arn}"
    log_info "Account ID:          ${verification_account}"

    if [[ -n "${dry_run}" ]]; then
        log_info "Dry run — printing policy JSON without applying"
    fi

    python3 "${SCRIPT_DIR}/apply-resource-policy.py" \
        --execution-agent-arn "${exec_agent_arn}" \
        --verification-role-arn "${verify_role_arn}" \
        --account-id "${verification_account}" \
        --region "${AWS_REGION}" \
        ${dry_run}

    if [[ -z "${dry_run}" ]]; then
        log_success "Execution Agent resource policy applied"
    fi
}

# ── Subcommand: help ─────────────────────────────────────────

cmd_help() {
    cat << 'EOF'
Usage: ./scripts/deploy.sh [SUBCOMMAND] [OPTIONS]

Subcommands:
  (none)                                   Full pipeline: deploy --force-rebuild + diagnostics (default)
  deploy [--force-rebuild]                Deploy only (no diagnostics)
  status                                  Stack status + image tag
  check-access                            A2A authorization troubleshooting
  logs [OPTIONS]                          Request tracing across all stages
  policy [--dry-run]                      Apply resource policy only
  help                                    Show this help

Logs options:
  --latest              Trace most recent Slack request (default)
  --correlation-id ID   Trace specific request by correlation_id
  --list-log-groups     Show discovered log groups
  --since DURATION      Time range (e.g. 1h, 30m). Default: 1h
  --limit N             Max events per log group. Default: 50

Environment variables:
  DEPLOYMENT_ENV        dev or prod (required for deploy)
  AWS_REGION            AWS region (default: ap-northeast-1)
  AWS_PROFILE           AWS CLI profile (optional)
  SLACK_BOT_TOKEN       Slack bot token (required for deploy)
  SLACK_SIGNING_SECRET  Slack signing secret (required for deploy)

Examples:
  DEPLOYMENT_ENV=dev ./scripts/deploy.sh
  DEPLOYMENT_ENV=dev ./scripts/deploy.sh deploy --force-rebuild
  ./scripts/deploy.sh status
  ./scripts/deploy.sh check-access
  ./scripts/deploy.sh logs --latest
  ./scripts/deploy.sh logs --correlation-id "abc-123-def" --since 2h
  ./scripts/deploy.sh policy --dry-run
EOF
}

# ── Dispatch ─────────────────────────────────────────────────

subcommand="${1:-all}"
case "$subcommand" in
    all)
        # Default: run full pipeline (deploy + diagnostics)
        shift 2>/dev/null || true
        cmd_deploy --force-rebuild "$@"
        echo ""
        log_info "=========================================="
        log_info "Post-deploy diagnostics"
        log_info "=========================================="
        echo ""
        cmd_status
        echo ""
        cmd_check_access
        echo ""
        cmd_logs --latest --since 5m 2>/dev/null || log_warning "No recent logs found (expected if this is a fresh deploy)"
        ;;
    deploy)       shift; cmd_deploy "$@" ;;
    status)       shift; cmd_status "$@" ;;
    check-access) shift; cmd_check_access "$@" ;;
    logs)         shift; cmd_logs "$@" ;;
    policy)       shift; cmd_policy "$@" ;;
    help|-h|--help) cmd_help ;;
    --force-rebuild)
        # Backward compat: treat --force-rebuild as deploy --force-rebuild
        cmd_deploy --force-rebuild ;;
    *)
        log_error "Unknown subcommand: ${subcommand}"
        echo ""
        cmd_help
        exit 1
        ;;
esac
