#!/usr/bin/env bash
#
# check-verification-logs.sh
#
# メンション〜返信までの各段階の CloudWatch ログを順に確認する。
# 「AIサービスへのアクセスが拒否されました」等の障害時に、どこで止まっているか切り分けする。
#
# Usage:
#   ./scripts/check-verification-logs.sh [--since 30m] [--region ap-northeast-1] [--env dev]
#
# Prerequisites: AWS CLI が設定済みであること。
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CDK_DIR="${PROJECT_ROOT}/cdk"

SINCE="${SINCE:-30m}"
AWS_REGION="${AWS_REGION:-ap-northeast-1}"
DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-dev}"
ENV_SUFFIX=""
[[ "${DEPLOYMENT_ENV}" == "prod" ]] && ENV_SUFFIX="Prod" || ENV_SUFFIX="Dev"
STACK_PREFIX="SlackAI-Verification-${ENV_SUFFIX}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --since)   SINCE="$2"; shift 2 ;;
    --region)  AWS_REGION="$2"; shift 2 ;;
    --env)     DEPLOYMENT_ENV="$2"; ENV_SUFFIX=$([[ "$2" == "prod" ]] && echo "Prod" || echo "Dev"); STACK_PREFIX="SlackAI-Verification-${ENV_SUFFIX}"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--since 30m] [--region ap-northeast-1] [--env dev]"; exit 0 ;;
    *)         echo "Unknown option: $1"; exit 1 ;;
  esac
done

_profile_args=""
[[ -n "${AWS_PROFILE:-}" ]] && _profile_args="--profile ${AWS_PROFILE}"

echo "=============================================="
echo "Verification 処理フロー ログ確認 (since=${SINCE}, region=${AWS_REGION}, env=${DEPLOYMENT_ENV})"
echo "=============================================="

# ロググループ名をプレフィックスで検索して取得（1件）
_get_log_group() {
  local prefix="$1"
  aws logs describe-log-groups ${_profile_args} --region "${AWS_REGION}" \
    --log-group-name-prefix "${prefix}" \
    --query 'logGroups[0].logGroupName' --output text 2>/dev/null || echo ""
}

# 複数候補がある場合に全て取得
_get_log_groups() {
  local prefix="$1"
  aws logs describe-log-groups ${_profile_args} --region "${AWS_REGION}" \
    --log-group-name-prefix "${prefix}" \
    --query 'logGroups[*].logGroupName' --output text 2>/dev/null || echo ""
}

# ログを tail（フィルタパターン省略時は直近ログ表示）
_tail_log() {
  local log_group="$1"
  local filter="${2:-}"
  if [[ -z "${log_group}" || "${log_group}" == "None" ]]; then
    echo "  (ロググループ未検出: ${log_group})"
    return
  fi
  echo "  Log group: ${log_group}"
  if [[ -n "${filter}" ]]; then
    aws logs tail "${log_group}" ${_profile_args} --region "${AWS_REGION}" \
      --since "${SINCE}" --format short --filter-pattern "${filter}" 2>/dev/null | head -80 || true
  else
    aws logs tail "${log_group}" ${_profile_args} --region "${AWS_REGION}" \
      --since "${SINCE}" --format short 2>/dev/null | head -80 || true
  fi
  echo ""
}

# --- [A] Slack Event Handler ---
echo ""
echo "--- [A] Slack Event Handler (メンション受信・署名検証・認可・SQS 送信) ---"
LG_HANDLER=$(_get_log_group "/aws/lambda/${STACK_PREFIX}-SlackEventHandler")
_tail_log "${LG_HANDLER}" "event_received"
_tail_log "${LG_HANDLER}" "event_callback_received"
_tail_log "${LG_HANDLER}" "sqs_enqueue_success"
_tail_log "${LG_HANDLER}" "whitelist_authorization_failed"
_tail_log "${LG_HANDLER}" "existence_check_failed"

# --- [B] Agent Invoker ---
echo "--- [B] Agent Invoker (SQS → InvokeAgentRuntime to Verification Agent) ---"
LG_INVOKER=$(_get_log_group "/aws/lambda/${STACK_PREFIX}-AgentInvoker")
_tail_log "${LG_INVOKER}" "agent_invocation_started"
_tail_log "${LG_INVOKER}" "agent_invocation_success"
_tail_log "${LG_INVOKER}" "agent_invocation_failed"

# --- [C] Verification Agent Runtime (AgentCore) ---
echo "--- [C] Verification Agent Runtime (認可・Execution 呼び出し) ---"
echo "  (AgentCore ロググループ一覧)"
aws logs describe-log-groups ${_profile_args} --region "${AWS_REGION}" \
  --log-group-name-prefix "/aws/bedrock-agentcore" \
  --query 'logGroups[*].logGroupName' --output text 2>/dev/null | tr '\t' '\n' | sed 's/^/    /'

for lg in $(_get_log_groups "/aws/bedrock-agentcore/"); do
  [[ -z "${lg}" || "${lg}" == "None" ]] && continue
  # エラー専用ログ
  if [[ "${lg}" == *"verification-agent-errors"* ]]; then
    echo ""
    echo "  [${lg}] (エラー専用)"
    _tail_log "${lg}" "invoke_execution_agent_failed"
    _tail_log "${lg}" "execution_agent_error"
    continue
  fi
  # ランタイム本体ログ（Verification は SlackAI_VerificationAgent 等の名前を含むことが多い）
  echo ""
  echo "  [${lg}]"
  aws logs tail "${lg}" ${_profile_args} --region "${AWS_REGION}" \
    --since "${SINCE}" --format short --filter-pattern "delegating_to_execution_agent" 2>/dev/null | head -30 || true
  aws logs tail "${lg}" ${_profile_args} --region "${AWS_REGION}" \
    --since "${SINCE}" --format short --filter-pattern "invoke_execution_agent_started" 2>/dev/null | head -20 || true
  aws logs tail "${lg}" ${_profile_args} --region "${AWS_REGION}" \
    --since "${SINCE}" --format short --filter-pattern "invoke_execution_agent_failed" 2>/dev/null | head -50 || true
  aws logs tail "${lg}" ${_profile_args} --region "${AWS_REGION}" \
    --since "${SINCE}" --format short --filter-pattern "execution_result_received" 2>/dev/null | head -20 || true
  aws logs tail "${lg}" ${_profile_args} --region "${AWS_REGION}" \
    --since "${SINCE}" --format short --filter-pattern "execution_agent_error" 2>/dev/null | head -30 || true
done
echo ""

# --- [D] Slack Poster ---
echo "--- [D] Slack Poster (Slack 投稿) ---"
LG_POSTER=$(_get_log_group "/aws/lambda/${STACK_PREFIX}-SlackPoster")
_tail_log "${LG_POSTER}" "slack_post_started"
_tail_log "${LG_POSTER}" "slack_post_success"
_tail_log "${LG_POSTER}" "slack_post_failed"

echo "=============================================="
echo "確認の目安:"
echo "  [A] event_callback_received / sqs_enqueue_success → Lambda まで届き SQS に送信済み"
echo "  [B] agent_invocation_success → Verification Agent Runtime 呼び出し成功"
echo "  [C] delegating_to_execution_agent → Execution 呼び出し開始"
echo "  [C] invoke_execution_agent_failed + AccessDeniedException → Execution 側の認可失敗"
echo "  [D] slack_post_success → Slack 投稿まで完了"
echo "=============================================="
