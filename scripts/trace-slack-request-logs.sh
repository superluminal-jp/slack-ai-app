#!/usr/bin/env bash
#
# trace-slack-request-logs.sh
#
# Slack からのリクエストについて、各段階（Slack Event Handler → Agent Invoker →
# Verification Agent → Execution Agent → Slack Poster）の AWS CloudWatch ログを
# 取得し、一覧表示する。
#
# Usage:
#   # 最新のリクエストのログを取得（過去1時間以内）
#   ./scripts/trace-slack-request-logs.sh --latest
#
#   # 特定の correlation_id でログを取得
#   ./scripts/trace-slack-request-logs.sh --correlation-id "abc-123-def"
#
#   # 過去2時間の範囲で最新リクエストを取得
#   ./scripts/trace-slack-request-logs.sh --latest --since 2h
#
#   # ロググループを表示のみ（探索モード）
#   ./scripts/trace-slack-request-logs.sh --list-log-groups
#
# Prerequisites:
#   - AWS CLI が設定済み
#   - jq がインストール済み（JSON パース用）
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Defaults
AWS_REGION="${AWS_REGION:-ap-northeast-1}"
DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-dev}"
STACK_PREFIX="SlackAI-Verification-$( [[ "$DEPLOYMENT_ENV" == "prod" ]] && echo "Prod" || echo "Dev" )"
SINCE_SECONDS=3600  # 1 hour
CORRELATION_ID=""
MODE="latest"  # latest | correlation-id | list
LIMIT=50

# Log groups (discovered at runtime)
SLACK_EVENT_HANDLER_LOG_GROUP=""
AGENT_INVOKER_LOG_GROUP=""
SLACK_POSTER_LOG_GROUP=""
VERIFICATION_AGENT_LOG_GROUP=""
EXECUTION_AGENT_LOG_GROUP=""

usage() {
    cat << 'EOF'
Usage: ./scripts/trace-slack-request-logs.sh [OPTIONS]

Options:
  --latest              最新の Slack リクエストのログを取得（デフォルト）
  --correlation-id ID   指定した correlation_id でログを取得
  --list-log-groups      ロググループ一覧を表示（探索モード）
  --since DURATION       時間範囲（例: 1h, 30m, 3600）デフォルト: 1h
  --region REGION        AWS リージョン（デフォルト: ap-northeast-1）
  --env ENV              デプロイ環境（dev|prod、デフォルト: dev）
  --limit N              各ロググループから取得する最大件数（デフォルト: 50）
  -h, --help             このヘルプを表示

Examples:
  ./scripts/trace-slack-request-logs.sh --latest
  ./scripts/trace-slack-request-logs.sh --correlation-id "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  ./scripts/trace-slack-request-logs.sh --latest --since 2h --limit 100
EOF
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

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --latest)
            MODE="latest"
            shift
            ;;
        --correlation-id)
            CORRELATION_ID="$2"
            MODE="correlation-id"
            shift 2
            ;;
        --list-log-groups)
            MODE="list"
            shift
            ;;
        --since)
            SINCE_SECONDS=$(parse_duration "$2")
            shift 2
            ;;
        --region)
            AWS_REGION="$2"
            shift 2
            ;;
        --env)
            DEPLOYMENT_ENV="$2"
            STACK_PREFIX="SlackAI-Verification-$( [[ "$2" == "prod" ]] && echo "Prod" || echo "Dev" )"
            shift 2
            ;;
        --limit)
            LIMIT="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
done

if [[ "$MODE" == "correlation-id" && -z "$CORRELATION_ID" ]]; then
    echo "Error: --correlation-id requires a value" >&2
    exit 1
fi

# Check jq
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required. Install with: brew install jq" >&2
    exit 1
fi

# Discover log groups
discover_log_groups() {
    echo -e "${BLUE}[INFO]${NC} Discovering log groups (prefix: ${STACK_PREFIX}, /aws/bedrock-agentcore)..." >&2

    # Lambda log groups
    for lg in $(aws logs describe-log-groups \
        --log-group-name-prefix "/aws/lambda/${STACK_PREFIX}" \
        --region "$AWS_REGION" \
        --query 'logGroups[*].logGroupName' \
        --output text 2>/dev/null || true); do
        [[ -z "$lg" ]] && continue
        if [[ "$lg" == *"SlackEventHandler"* ]]; then
            SLACK_EVENT_HANDLER_LOG_GROUP="$lg"
        elif [[ "$lg" == *"AgentInvoker"* ]]; then
            AGENT_INVOKER_LOG_GROUP="$lg"
        elif [[ "$lg" == *"SlackPoster"* ]]; then
            SLACK_POSTER_LOG_GROUP="$lg"
        fi
    done

    # AgentCore runtime log groups
    for lg in $(aws logs describe-log-groups \
        --log-group-name-prefix "/aws/bedrock-agentcore/runtimes" \
        --region "$AWS_REGION" \
        --query 'logGroups[*].logGroupName' \
        --output text 2>/dev/null || true); do
        [[ -z "$lg" ]] && continue
        if [[ "$lg" == *"VerificationAgent"* ]] && [[ "$lg" == *"-DEFAULT" ]]; then
            VERIFICATION_AGENT_LOG_GROUP="$lg"
        elif [[ "$lg" == *"ExecutionAgent"* ]] && [[ "$lg" == *"-DEFAULT" ]]; then
            EXECUTION_AGENT_LOG_GROUP="$lg"
        fi
    done
}

# Get latest correlation_id from Slack Event Handler (sqs_enqueue_success) or Agent Invoker
# filter-log-events returns events in ascending order; use limit 20 and take last for most recent
get_latest_correlation_id() {
    local start_ms=$(( ($(date +%s) - SINCE_SECONDS) * 1000 ))

    # Try Slack Event Handler first (request_id in sqs_enqueue_success = correlation_id)
    if [[ -n "$SLACK_EVENT_HANDLER_LOG_GROUP" ]]; then
        local event
        event=$(aws logs filter-log-events \
            --log-group-name "$SLACK_EVENT_HANDLER_LOG_GROUP" \
            --start-time "$start_ms" \
            --filter-pattern "sqs_enqueue_success" \
            --region "$AWS_REGION" \
            --limit 20 \
            --output json 2>/dev/null | jq -r '.events[-1].message // empty' 2>/dev/null || true)
        if [[ -n "$event" ]]; then
            local rid
            rid=$(echo "$event" | jq -r '.request_id // empty' 2>/dev/null || true)
            if [[ -n "$rid" ]]; then
                echo "$rid"
                return
            fi
        fi
    fi

    # Fallback: Agent Invoker (correlation_id in agent_invocation_started/success/failed)
    if [[ -n "$AGENT_INVOKER_LOG_GROUP" ]]; then
        local event
        event=$(aws logs filter-log-events \
            --log-group-name "$AGENT_INVOKER_LOG_GROUP" \
            --start-time "$start_ms" \
            --filter-pattern "?agent_invocation_success ?agent_invocation_failed ?agent_invocation_started" \
            --region "$AWS_REGION" \
            --limit 20 \
            --output json 2>/dev/null | jq -r '.events[-1].message // empty' 2>/dev/null || true)
        if [[ -n "$event" ]]; then
            local cid
            cid=$(echo "$event" | jq -r '.correlation_id // .request_id // empty' 2>/dev/null || true)
            if [[ -n "$cid" ]]; then
                echo "$cid"
                return
            fi
        fi
    fi

    # Fallback: Slack Poster (correlation_id in slack_post_started)
    if [[ -n "$SLACK_POSTER_LOG_GROUP" ]]; then
        local event
        event=$(aws logs filter-log-events \
            --log-group-name "$SLACK_POSTER_LOG_GROUP" \
            --start-time "$start_ms" \
            --filter-pattern "slack_post_started" \
            --region "$AWS_REGION" \
            --limit 20 \
            --output json 2>/dev/null | jq -r '.events[-1].message // empty' 2>/dev/null || true)
        if [[ -n "$event" ]]; then
            local cid
            cid=$(echo "$event" | jq -r '.correlation_id // empty' 2>/dev/null || true)
            if [[ -n "$cid" ]]; then
                echo "$cid"
                return
            fi
        fi
    fi

    echo ""
}

# Fetch logs from a log group filtered by correlation_id or request_id
# $3: "agentcore" = AgentCore runtime (fallback to unfiltered when filter returns 0)
fetch_logs() {
    local log_group="$1"
    local stage_name="$2"
    local is_agentcore="${3:-}"
    local start_ms=$(( ($(date +%s) - SINCE_SECONDS) * 1000 ))

    [[ -z "$log_group" ]] && return

    local filter_pattern=""
    if [[ -n "$CORRELATION_ID" ]]; then
        # CloudWatch filter: match any line containing the correlation_id value
        # (works for correlation_id, request_id, or UUID in various JSON fields)
        filter_pattern="\"$CORRELATION_ID\""
    fi

    local events_json
    if [[ -n "$filter_pattern" ]]; then
        events_json=$(aws logs filter-log-events \
            --log-group-name "$log_group" \
            --start-time "$start_ms" \
            --filter-pattern "$filter_pattern" \
            --region "$AWS_REGION" \
            --limit "$LIMIT" \
            --output json 2>/dev/null || echo '{"events":[]}')
    else
        events_json=$(aws logs filter-log-events \
            --log-group-name "$log_group" \
            --start-time "$start_ms" \
            --region "$AWS_REGION" \
            --limit "$LIMIT" \
            --output json 2>/dev/null || echo '{"events":[]}')
    fi

    local count
    count=$(echo "$events_json" | jq '.events | length' 2>/dev/null || echo "0")

    # AgentCore: when filter returns 0, retry without filter (platform may wrap logs differently)
    local fallback_msg=""
    if [[ "$count" -eq 0 && "$is_agentcore" == "agentcore" && -n "$filter_pattern" ]]; then
        events_json=$(aws logs filter-log-events \
            --log-group-name "$log_group" \
            --start-time "$start_ms" \
            --region "$AWS_REGION" \
            --limit "$LIMIT" \
            --output json 2>/dev/null || echo '{"events":[]}')
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

# Main
main() {
    discover_log_groups

    if [[ "$MODE" == "list" ]]; then
        echo -e "${CYAN}Discovered log groups:${NC}"
        echo ""
        echo "Slack Event Handler:  ${SLACK_EVENT_HANDLER_LOG_GROUP:-<not found>}"
        echo "Agent Invoker:       ${AGENT_INVOKER_LOG_GROUP:-<not found>}"
        echo "Slack Poster:         ${SLACK_POSTER_LOG_GROUP:-<not found>}"
        echo "Verification Agent:   ${VERIFICATION_AGENT_LOG_GROUP:-<not found>}"
        echo "Execution Agent:      ${EXECUTION_AGENT_LOG_GROUP:-<not found>}"
        exit 0
    fi

    if [[ "$MODE" == "latest" ]]; then
        CORRELATION_ID=$(get_latest_correlation_id)
        if [[ -z "$CORRELATION_ID" ]]; then
            echo -e "${RED}Error: No Slack request found in the last $((SINCE_SECONDS/60)) minutes.${NC}" >&2
            echo "Try increasing --since (e.g. --since 2h) or use --list-log-groups to verify log groups." >&2
            exit 1
        fi
        echo -e "${CYAN}Latest correlation_id: ${CORRELATION_ID}${NC}"
        echo ""
    fi

    echo -e "${CYAN}=== Slack Request Log Trace (correlation_id: ${CORRELATION_ID}) ===${NC}"
    echo ""

    fetch_logs "$SLACK_EVENT_HANDLER_LOG_GROUP" "1. Slack Event Handler"
    fetch_logs "$AGENT_INVOKER_LOG_GROUP" "2. Agent Invoker"
    fetch_logs "$VERIFICATION_AGENT_LOG_GROUP" "3. Verification Agent (AgentCore)" "agentcore"
    fetch_logs "$EXECUTION_AGENT_LOG_GROUP" "4. Execution Agent (AgentCore)" "agentcore"
    fetch_logs "$SLACK_POSTER_LOG_GROUP" "5. Slack Poster"
}

main
