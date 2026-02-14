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
# Usage:
#   export DEPLOYMENT_ENV=dev
#   ./scripts/deploy.sh                        # full pipeline (default)
#   ./scripts/deploy.sh deploy --force-rebuild  # deploy only
#   ./scripts/deploy.sh status
#   ./scripts/deploy.sh logs --latest
#

set -euo pipefail

# ── Colors & logging ─────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

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
PROFILE_ARGS="${AWS_PROFILE:+--profile ${AWS_PROFILE}}"

# Deployment environment
DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-}"
if [[ -z "${DEPLOYMENT_ENV}" ]]; then
    DEPLOYMENT_ENV=$(jq -r '.context.deploymentEnv // "dev"' "${CDK_DIR}/cdk.json" 2>/dev/null || echo "dev")
    log_warning "DEPLOYMENT_ENV not set. Using default: ${DEPLOYMENT_ENV}"
fi
DEPLOYMENT_ENV=$(echo "${DEPLOYMENT_ENV}" | tr '[:upper:]' '[:lower:]' | tr -d ' ')

case "${DEPLOYMENT_ENV}" in
    dev|prod) ;;
    *) log_error "Invalid DEPLOYMENT_ENV '${DEPLOYMENT_ENV}'. Must be dev or prod"; exit 1 ;;
esac

# Stack names
ENV_SUFFIX=$([[ "${DEPLOYMENT_ENV}" == "prod" ]] && echo "Prod" || echo "Dev")
EXEC_STACK="${EXECUTION_STACK_NAME:-SlackAI-Execution}-${ENV_SUFFIX}"
VERIFY_STACK="${VERIFICATION_STACK_NAME:-SlackAI-Verification}-${ENV_SUFFIX}"

# ── Shared helpers ───────────────────────────────────────────

get_config_value() {
    local config_file="${CDK_DIR}/cdk.config.${DEPLOYMENT_ENV}.json"
    [[ -f "${config_file}" ]] && jq -r ".\"$1\" // empty" "${config_file}" 2>/dev/null || echo ""
}

get_stack_output() {
    aws cloudformation describe-stacks \
        --stack-name "$1" --region "${AWS_REGION}" ${PROFILE_ARGS} \
        --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" \
        --output text 2>/dev/null || echo ""
}

read_output() {
    jq -r ".\"$2\".\"$3\" // empty" "$1" 2>/dev/null || echo ""
}

# Prefer outputs file (from cdk deploy --outputs-file), then CloudFormation.
get_output_from_file_or_stack() {
    local file="$1" stack="$2" key="$3"
    local v
    v=$(read_output "$file" "$stack" "$key")
    [[ -n "$v" ]] && echo "$v" && return
    get_stack_output "$stack" "$key"
}

get_runtime_id() { [[ -n "$1" ]] && echo "${1##*/}" || echo ""; }

require_commands() {
    for cmd in "$@"; do
        command -v "$cmd" &>/dev/null || { log_error "${cmd} is not installed"; exit 1; }
    done
}

wait_for_agent_ready() {
    local label=$1 runtime_id=$2 max_wait=${3:-120} elapsed=0 interval=10 status=""
    log_info "Checking ${label} Runtime status (id: ${runtime_id})..."
    while (( elapsed < max_wait )); do
        status=$(aws bedrock-agentcore-control get-agent-runtime \
            --agent-runtime-id "${runtime_id}" --region "${AWS_REGION}" ${PROFILE_ARGS} \
            --query 'status' --output text 2>/dev/null || echo "UNKNOWN")
        [[ "${status}" == "READY" ]] && { log_success "${label} Runtime is READY"; return 0; }
        log_info "${label} status: ${status}. Waiting ${interval}s... (${elapsed}/${max_wait}s)"
        sleep ${interval}
        (( elapsed += interval ))
    done
    log_warning "${label} did not reach READY within ${max_wait}s. Current: ${status}"
    return 1
}

parse_duration() {
    local d="$1"
    [[ "$d" =~ ^([0-9]+)h$ ]] && echo $(( BASH_REMATCH[1] * 3600 )) && return
    [[ "$d" =~ ^([0-9]+)m$ ]] && echo $(( BASH_REMATCH[1] * 60 )) && return
    [[ "$d" =~ ^[0-9]+$ ]]    && echo "$d" && return
    echo "3600"
}

# Fetch and display CloudWatch logs for a single log group.
# Args: log_group stage_name [agentcore]
# Uses outer: correlation_id, since_seconds, limit (from cmd_logs)
_fetch_logs() {
    local log_group="$1" stage_name="$2" is_agentcore="${3:-}"
    [[ -z "$log_group" ]] && return
    local start_ms=$(( ($(date +%s) - since_seconds) * 1000 ))
    local filter_pattern="" events_json count fallback_msg=""
    [[ -n "$correlation_id" ]] && filter_pattern="\"$correlation_id\""

    local common_args="--log-group-name $log_group --start-time $start_ms --region $AWS_REGION ${PROFILE_ARGS} --limit $limit --output json"
    if [[ -n "$filter_pattern" ]]; then
        events_json=$(aws logs filter-log-events ${common_args} --filter-pattern "$filter_pattern" 2>/dev/null || echo '{"events":[]}')
    else
        events_json=$(aws logs filter-log-events ${common_args} 2>/dev/null || echo '{"events":[]}')
    fi
    count=$(echo "$events_json" | jq '.events | length' 2>/dev/null || echo "0")

    # AgentCore: retry without filter when filter returns 0 (platform may wrap logs differently)
    if (( count == 0 )) && [[ "$is_agentcore" == "agentcore" && -n "$filter_pattern" ]]; then
        events_json=$(aws logs filter-log-events ${common_args} 2>/dev/null || echo '{"events":[]}')
        count=$(echo "$events_json" | jq '.events | length' 2>/dev/null || echo "0")
        (( count > 0 )) && fallback_msg=" (No events matched correlation_id; showing recent logs)"
    fi

    if (( count == 0 )); then
        echo -e "${YELLOW}[$stage_name]${NC} (log group: $log_group)"
        echo "  No events found."
        echo ""
        return
    fi

    echo -e "${GREEN}[$stage_name]${NC} (log group: $log_group) -- $count event(s)${fallback_msg}"
    echo "---"
    echo "$events_json" | jq -r '.events[] | "\(.timestamp | tonumber / 1000 | strftime("%Y-%m-%d %H:%M:%S")) | \(.message)"' 2>/dev/null \
        | while IFS= read -r line; do echo "  $line"; done
    echo ""
}

# ── Subcommand: deploy ───────────────────────────────────────

cmd_deploy() {
    local exec_outputs verify_outputs force_rebuild="false"
    exec_outputs="$(mktemp)"; verify_outputs="$(mktemp)"
    trap "rm -f '${exec_outputs}' '${verify_outputs}'" EXIT

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --force-rebuild) force_rebuild="true"; shift ;;
            *) log_error "Unknown deploy option: $1"; exit 1 ;;
        esac
    done

    # Prerequisites
    log_info "Checking prerequisites (env=${DEPLOYMENT_ENV})..."
    if [[ -z "${SLACK_BOT_TOKEN:-}" ]]; then
        SLACK_BOT_TOKEN=$(get_config_value "slackBotToken")
        [[ -n "${SLACK_BOT_TOKEN}" ]] && export SLACK_BOT_TOKEN && log_info "Loaded SLACK_BOT_TOKEN from config"
    fi
    if [[ -z "${SLACK_SIGNING_SECRET:-}" ]]; then
        SLACK_SIGNING_SECRET=$(get_config_value "slackSigningSecret")
        [[ -n "${SLACK_SIGNING_SECRET}" ]] && export SLACK_SIGNING_SECRET && log_info "Loaded SLACK_SIGNING_SECRET from config"
    fi
    [[ -z "${SLACK_BOT_TOKEN:-}" ]]     && { log_error "SLACK_BOT_TOKEN is required"; exit 1; }
    [[ -z "${SLACK_SIGNING_SECRET:-}" ]] && { log_error "SLACK_SIGNING_SECRET is required"; exit 1; }
    require_commands aws node jq
    [[ -x "${CDK_CLI}" ]] || { log_error "CDK CLI not found at ${CDK_CLI}. Run: cd ${CDK_DIR} && npm install"; exit 1; }
    log_success "Prerequisites OK (Execution: ${EXEC_STACK}, Verification: ${VERIFY_STACK})"

    # Phase 1: Execution Stack
    log_info "========== Phase 1: Deploying Execution Stack =========="
    local docs_src="${PROJECT_ROOT}/docs"
    local agent_docs="${PROJECT_ROOT}/cdk/lib/execution/agent/execution-agent/docs"
    if [[ -d "${docs_src}" ]]; then
        rm -rf "${agent_docs}"; cp -r "${docs_src}" "${agent_docs}"
        log_info "Copied docs/ into Execution Agent build context"
    fi

    local context_args="--context deploymentEnv=${DEPLOYMENT_ENV}"
    if [[ "${force_rebuild}" == "true" || -n "${FORCE_EXECUTION_IMAGE_REBUILD:-}" ]]; then
        local hash="${FORCE_EXECUTION_IMAGE_REBUILD:-$(date +%s)}"
        context_args+=" --context forceExecutionImageRebuild=${hash}"
        log_info "Forcing image rebuild (extraHash=${hash})"
        [[ -d "${CDK_DIR}/cdk.out" ]] && rm -rf "${CDK_DIR}/cdk.out"
    fi

    ( cd "${CDK_DIR}" && "${CDK_CLI}" deploy "${EXEC_STACK}" \
        ${PROFILE_ARGS} --require-approval never \
        --outputs-file "${exec_outputs}" ${context_args} ) \
        || { log_error "Failed to deploy ${EXEC_STACK}"; exit 1; }

    exec_arn=$(get_output_from_file_or_stack "${exec_outputs}" "${EXEC_STACK}" "ExecutionAgentRuntimeArn")
    [[ -z "${exec_arn}" ]] && { log_error "ExecutionAgentRuntimeArn not found in outputs"; exit 1; }
    log_success "Execution Stack deployed (ARN: ${exec_arn})"

    # Phase 2: Verification Stack
    log_info "========== Phase 2: Deploying Verification Stack =========="
    local verify_ctx="--context deploymentEnv=${DEPLOYMENT_ENV}"
    [[ -n "${exec_arn}" ]] && verify_ctx+=" --context executionAgentArn=${exec_arn}"

    ( cd "${CDK_DIR}" && "${CDK_CLI}" deploy "${VERIFY_STACK}" \
        ${PROFILE_ARGS} --require-approval never \
        --outputs-file "${verify_outputs}" ${verify_ctx} ) \
        || { log_error "Failed to deploy ${VERIFY_STACK}"; exit 1; }
    log_success "Verification Stack deployed"

    # Phase 2.5: Resource policy
    local account_id verify_account
    account_id=$(aws sts get-caller-identity ${PROFILE_ARGS} --query Account --output text 2>/dev/null || echo "")
    if [[ -n "${exec_arn}" && -n "${account_id}" ]]; then
        verify_account=$(get_config_value "verificationAccountId")
        : "${verify_account:=${account_id}}"
        local role_arn="arn:aws:iam::${verify_account}:role/${VERIFY_STACK}-ExecutionRole"
        log_info "Applying resource policy (Principal: ${role_arn})"
        python3 "${SCRIPT_DIR}/apply-resource-policy.py" \
            --execution-agent-arn "${exec_arn}" \
            --verification-role-arn "${role_arn}" \
            --account-id "${verify_account}" \
            --region "${AWS_REGION}" \
            && log_success "Resource policy applied" \
            || log_warning "Could not apply resource policy"
    fi

    # Phase 3: Validate AgentCore runtimes
    log_info "========== Phase 3: AgentCore Validation =========="
    local handler_url verify_arn
    handler_url=$(get_output_from_file_or_stack "${verify_outputs}" "${VERIFY_STACK}" "SlackEventHandlerUrl")
    verify_arn=$(get_output_from_file_or_stack "${verify_outputs}" "${VERIFY_STACK}" "VerificationAgentRuntimeArn")
    local eid vid
    eid=$(get_runtime_id "${exec_arn}"); vid=$(get_runtime_id "${verify_arn}")
    [[ -n "${eid}" ]] && wait_for_agent_ready "Execution Agent" "${eid}" 120
    [[ -n "${vid}" ]] && wait_for_agent_ready "Verification Agent" "${vid}" 120

    # Summary
    echo ""
    log_success "========== Deployment Complete! =========="
    echo ""
    echo "Slack Event Handler URL: ${handler_url:-N/A}"
    echo "Execution Agent ARN:     ${exec_arn:-N/A}"
    echo "Verification Agent ARN:  ${verify_arn:-N/A}"
    echo ""
    echo "Next steps:"
    echo "  1. Configure Slack Event Subscriptions with the URL above"
    echo "  2. Send a message to your Slack bot"
    echo "  3. Check Agent Cards at /.well-known/agent-card.json"
    echo ""
}

# ── Subcommand: status ───────────────────────────────────────

cmd_status() {
    echo "=== Execution Stack status (${EXEC_STACK}) ==="
    aws cloudformation describe-stacks --stack-name "${EXEC_STACK}" \
        --region "${AWS_REGION}" ${PROFILE_ARGS} \
        --query 'Stacks[0].{LastUpdated:LastUpdatedTime,Status:StackStatus}' \
        --output table 2>/dev/null || { echo "Stack not found or no access."; exit 1; }
    echo ""
    echo "Container image tag:"
    aws cloudformation get-template --stack-name "${EXEC_STACK}" \
        --region "${AWS_REGION}" ${PROFILE_ARGS} \
        --query 'TemplateBody' --output text 2>/dev/null \
        | grep -o 'ContainerUri.*[a-f0-9]\{64\}' | sed 's/.*://;s/[^a-f0-9].*//' | head -1 || echo "(could not extract)"
}

# ── Subcommand: check-access ─────────────────────────────────

cmd_check_access() {
    local expected_role="${VERIFY_STACK}-ExecutionRole"
    echo "=============================================="
    echo "Execution アクセス確認 (region=${AWS_REGION}, env=${DEPLOYMENT_ENV})"
    echo "=============================================="

    # [1] Resource policy
    echo ""
    echo "--- [1] Execution Agent リソースポリシー ---"
    local exec_arn
    exec_arn=$(get_stack_output "${EXEC_STACK}" "ExecutionAgentRuntimeArn")
    if [[ -z "${exec_arn}" || "${exec_arn}" == "None" ]]; then
        echo "  (スキップ) ExecutionAgentRuntimeArn を取得できませんでした。"
    else
        echo "  Runtime ARN: ${exec_arn}"
        local policy_json
        policy_json=$(aws bedrock-agentcore-control get-resource-policy ${PROFILE_ARGS} \
            --region "${AWS_REGION}" --resource-arn "${exec_arn}" 2>/dev/null \
            | jq -r '.policy // empty' || true)
        if [[ -z "${policy_json}" ]]; then
            echo "  (警告) ポリシー取得不可。./scripts/deploy.sh policy で適用してください。"
        else
            echo "  現在のポリシー:"
            echo "${policy_json}" | jq '.' 2>/dev/null || echo "${policy_json}"
            local principal
            principal=$(echo "${policy_json}" | jq -r '
                .Statement[0].Principal.AWS //
                .Statement[0].Principal |
                if type == "array" then .[0] else . end
            ' 2>/dev/null || true)
            echo "  Principal: ${principal}"
            if [[ "${principal}" == *"${expected_role}"* ]]; then
                echo "  => OK: ${expected_role} が許可されています。"
            else
                echo "  => 要確認: 期待するロール ${expected_role}。./scripts/deploy.sh policy を実行してください。"
            fi
        fi
    fi

    # [2] IAM policy
    echo ""
    echo "--- [2] Verification Agent IAM（Runtime + Endpoint） ---"
    if ! aws iam get-role ${PROFILE_ARGS} --role-name "${expected_role}" &>/dev/null; then
        echo "  (スキップ) ロール ${expected_role} が見つかりません。"
    else
        echo "  ロール: ${expected_role}"
        local found=0 has_rt=0 has_ep=0
        for pol in $(aws iam list-role-policies ${PROFILE_ARGS} --role-name "${expected_role}" \
            --query 'PolicyNames' --output text 2>/dev/null); do
            local doc
            doc=$(aws iam get-role-policy ${PROFILE_ARGS} --role-name "${expected_role}" \
                --policy-name "${pol}" --query 'PolicyDocument' --output json 2>/dev/null || true)
            if echo "${doc}" | jq -e '.Statement[] | select(.Sid == "AgentCoreInvoke")' &>/dev/null; then
                found=1
                local res
                res=$(echo "${doc}" | jq -r '.Statement[] | select(.Sid == "AgentCoreInvoke") | .Resource' 2>/dev/null)
                echo "${res}" | grep -q "runtime/" && has_rt=1
                echo "${res}" | grep -q "runtime-endpoint/" && has_ep=1
                echo "  Resource:"
                echo "${doc}" | jq '.Statement[] | select(.Sid == "AgentCoreInvoke") | .Resource' 2>/dev/null || true
                break
            fi
        done
        if (( found == 0 )); then
            echo "  (警告) AgentCoreInvoke ステートメントが見つかりません。"
        elif (( has_rt && has_ep )); then
            echo "  => OK: Runtime + Endpoint 両方許可されています。"
        else
            echo "  => 要確認: Runtime/Endpoint のいずれかが不足。Verification を再デプロイしてください。"
        fi
    fi

    # [3] Runtime logs
    echo ""
    echo "--- [3] Verification Runtime ログ（invoke_execution_agent_failed） ---"
    local log_groups
    log_groups=$(aws logs describe-log-groups ${PROFILE_ARGS} --region "${AWS_REGION}" \
        --log-group-name-prefix "/aws/bedrock-agentcore/runtimes/SlackAI_VerificationAgent" \
        --query 'logGroups[*].logGroupName' --output text 2>/dev/null || true)
    if [[ -z "${log_groups}" ]]; then
        echo "  (スキップ) ロググループが見つかりません。"
    else
        for lg in ${log_groups}; do
            [[ "${lg}" != *"VerificationAgent"* ]] && continue
            echo "  Log group: ${lg}"
            aws logs tail "${lg}" ${PROFILE_ARGS} --region "${AWS_REGION}" \
                --since 2h --format short --filter-pattern "invoke_execution_agent_failed" 2>/dev/null | head -25 || true
        done
        echo "  => error_code/error_message があれば Execution 側を確認してください。"
    fi
    echo "=============================================="
}

# ── Subcommand: logs ─────────────────────────────────────────

cmd_logs() {
    local mode="latest" correlation_id="" since_seconds=3600 limit=50

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
    [[ "$mode" == "correlation-id" && -z "$correlation_id" ]] && { log_error "--correlation-id requires a value"; exit 1; }

    # Discover log groups (Lambda + AgentCore in parallel)
    local seh_lg="" ai_lg="" sp_lg="" va_lg="" ea_lg=""
    log_info "Discovering log groups..."
    local lambda_groups agentcore_groups
    lambda_groups=$(mktemp)
    agentcore_groups=$(mktemp)
    aws logs describe-log-groups \
        --log-group-name-prefix "/aws/lambda/${VERIFY_STACK}" \
        --region "$AWS_REGION" ${PROFILE_ARGS} \
        --query 'logGroups[*].logGroupName' --output text 2>/dev/null > "${lambda_groups}" &
    aws logs describe-log-groups \
        --log-group-name-prefix "/aws/bedrock-agentcore/runtimes" \
        --region "$AWS_REGION" ${PROFILE_ARGS} \
        --query 'logGroups[*].logGroupName' --output text 2>/dev/null > "${agentcore_groups}" &
    wait
    for lg in $(cat "${lambda_groups}"); do
        case "$lg" in
            *SlackEventHandler*) seh_lg="$lg" ;;
            *AgentInvoker*)      ai_lg="$lg" ;;
            *SlackPoster*)       sp_lg="$lg" ;;
        esac
    done
    for lg in $(cat "${agentcore_groups}"); do
        [[ "$lg" == *VerificationAgent*-DEFAULT ]] && va_lg="$lg"
        [[ "$lg" == *ExecutionAgent*-DEFAULT ]]    && ea_lg="$lg"
    done
    rm -f "${lambda_groups}" "${agentcore_groups}"

    if [[ "$mode" == "list" ]]; then
        echo -e "${CYAN}Discovered log groups:${NC}"
        printf "  %-24s %s\n" "Slack Event Handler:" "${seh_lg:-<not found>}"
        printf "  %-24s %s\n" "Agent Invoker:" "${ai_lg:-<not found>}"
        printf "  %-24s %s\n" "Slack Poster:" "${sp_lg:-<not found>}"
        printf "  %-24s %s\n" "Verification Agent:" "${va_lg:-<not found>}"
        printf "  %-24s %s\n" "Execution Agent:" "${ea_lg:-<not found>}"
        return
    fi

    # Find latest correlation_id
    if [[ "$mode" == "latest" ]]; then
        local start_ms=$(( ($(date +%s) - since_seconds) * 1000 ))
        local -a search_targets=(
            "${seh_lg}|sqs_enqueue_success|.request_id"
            "${ai_lg}|?agent_invocation_success ?agent_invocation_failed ?agent_invocation_started|.correlation_id // .request_id"
            "${sp_lg}|slack_post_started|.correlation_id"
        )
        for target in "${search_targets[@]}"; do
            [[ -n "$correlation_id" ]] && break
            IFS='|' read -r lg filter jq_expr <<< "$target"
            [[ -z "$lg" ]] && continue
            local msg
            msg=$(aws logs filter-log-events --log-group-name "$lg" \
                --start-time "$start_ms" --filter-pattern "$filter" \
                --region "$AWS_REGION" ${PROFILE_ARGS} --limit 20 --output json 2>/dev/null \
                | jq -r '.events[-1].message // empty' 2>/dev/null || true)
            [[ -n "$msg" ]] && correlation_id=$(echo "$msg" | jq -r "${jq_expr} // empty" 2>/dev/null || true)
        done

        if [[ -z "$correlation_id" ]]; then
            log_error "No Slack request found in the last $((since_seconds/60)) minutes."
            echo "Try --since 2h or --list-log-groups." >&2
            exit 1
        fi
        echo -e "${CYAN}Latest correlation_id: ${correlation_id}${NC}"
        echo ""
    fi

    echo -e "${CYAN}=== Slack Request Log Trace (correlation_id: ${correlation_id}) ===${NC}"
    echo ""
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

    local exec_arn account_id verify_account
    exec_arn=$(get_stack_output "${EXEC_STACK}" "ExecutionAgentRuntimeArn")
    [[ -z "${exec_arn}" ]] && { log_error "ExecutionAgentRuntimeArn not found. Is ${EXEC_STACK} deployed?"; exit 1; }

    account_id=$(aws sts get-caller-identity ${PROFILE_ARGS} --query Account --output text 2>/dev/null || echo "")
    [[ -z "${account_id}" ]] && { log_error "Failed to get AWS account ID."; exit 1; }

    verify_account=$(get_config_value "verificationAccountId")
    : "${verify_account:=${account_id}}"
    local role_arn="arn:aws:iam::${verify_account}:role/${VERIFY_STACK}-ExecutionRole"

    log_info "Execution Agent: ${exec_arn}"
    log_info "Verification Role: ${role_arn}"
    [[ -n "${dry_run}" ]] && log_info "Dry run — printing policy only"

    python3 "${SCRIPT_DIR}/apply-resource-policy.py" \
        --execution-agent-arn "${exec_arn}" \
        --verification-role-arn "${role_arn}" \
        --account-id "${verify_account}" \
        --region "${AWS_REGION}" ${dry_run}
    [[ -z "${dry_run}" ]] && log_success "Resource policy applied"
}

# ── Subcommand: help ─────────────────────────────────────────

cmd_help() {
    cat << 'EOF'
Usage: ./scripts/deploy.sh [SUBCOMMAND] [OPTIONS]

Subcommands:
  (none)                                   Full pipeline: deploy --force-rebuild + diagnostics (default)
  deploy [--force-rebuild]                Deploy only
  status                                  Stack status + image tag
  check-access                            A2A authorization troubleshooting
  logs [OPTIONS]                          Request tracing across all stages
  policy [--dry-run]                      Apply resource policy only
  help                                    Show this help

Logs options:
  --latest              Trace most recent request (default)
  --correlation-id ID   Trace specific request
  --list-log-groups     Show discovered log groups
  --since DURATION      Time range (1h, 30m). Default: 1h
  --limit N             Max events per group. Default: 50

Environment variables:
  DEPLOYMENT_ENV        dev or prod (required for deploy)
  AWS_REGION            Default: ap-northeast-1
  AWS_PROFILE           AWS CLI profile (optional)
  SLACK_BOT_TOKEN       Required for deploy
  SLACK_SIGNING_SECRET  Required for deploy

Examples:
  DEPLOYMENT_ENV=dev ./scripts/deploy.sh
  DEPLOYMENT_ENV=dev ./scripts/deploy.sh deploy --force-rebuild
  ./scripts/deploy.sh status
  ./scripts/deploy.sh logs --latest --since 2h
  ./scripts/deploy.sh policy --dry-run
EOF
}

# ── Dispatch ─────────────────────────────────────────────────

case "${1:-all}" in
    all)
        shift 2>/dev/null || true
        cmd_deploy --force-rebuild "$@"
        echo ""
        log_info "========== Post-deploy diagnostics =========="
        echo ""
        cmd_status
        echo ""
        cmd_check_access
        echo ""
        cmd_logs --latest --since 5m 2>/dev/null || log_warning "No recent logs (expected for fresh deploy)"
        ;;
    deploy)       shift; cmd_deploy "$@" ;;
    status)       shift; cmd_status "$@" ;;
    check-access) shift; cmd_check_access "$@" ;;
    logs)         shift; cmd_logs "$@" ;;
    policy)       shift; cmd_policy "$@" ;;
    help|-h|--help) cmd_help ;;
    *)  log_error "Unknown subcommand: $1"; echo ""; cmd_help; exit 1 ;;
esac
