#!/usr/bin/env bash
#
# check-execution-access.sh
#
# 「AIサービスへのアクセスが拒否されました」の原因切り分けのため、次を確認する:
#  1. Execution Agent のリソースポリシー（Principal が Verification の実行ロールか）
#  2. Verification Agent の IAM ポリシー（Runtime + Endpoint の両方に InvokeAgentRuntime 許可があるか）
#  3. Verification Runtime ログの invoke_execution_agent_failed（AWS の生エラー）
#
# Usage:
#   ./scripts/check-execution-access.sh [--region ap-northeast-1] [--env dev]
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CDK_DIR="${PROJECT_ROOT}/cdk"

AWS_REGION="${AWS_REGION:-ap-northeast-1}"
DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-dev}"
ENV_SUFFIX=""
[[ "${DEPLOYMENT_ENV}" == "prod" ]] && ENV_SUFFIX="Prod" || ENV_SUFFIX="Dev"
VERIFICATION_STACK_NAME="SlackAI-Verification-${ENV_SUFFIX}"
EXECUTION_STACK_NAME="SlackAI-Execution-${ENV_SUFFIX}"
EXPECTED_VERIFICATION_ROLE_NAME="${VERIFICATION_STACK_NAME}-ExecutionRole"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --region)  AWS_REGION="$2"; shift 2 ;;
    --env)     DEPLOYMENT_ENV="$2"; ENV_SUFFIX=$([[ "$2" == "prod" ]] && echo "Prod" || echo "Dev"); VERIFICATION_STACK_NAME="SlackAI-Verification-${ENV_SUFFIX}"; EXECUTION_STACK_NAME="SlackAI-Execution-${ENV_SUFFIX}"; EXPECTED_VERIFICATION_ROLE_NAME="${VERIFICATION_STACK_NAME}-ExecutionRole"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--region ap-northeast-1] [--env dev]"; exit 0 ;;
    *)         echo "Unknown option: $1"; exit 1 ;;
  esac
done

_profile_args=""
[[ -n "${AWS_PROFILE:-}" ]] && _profile_args="--profile ${AWS_PROFILE}"

get_stack_output() {
  aws cloudformation describe-stacks ${_profile_args} --region "${AWS_REGION}" \
    --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text 2>/dev/null || echo ""
}

echo "=============================================="
echo "Execution アクセス確認 (region=${AWS_REGION}, env=${DEPLOYMENT_ENV})"
echo "=============================================="

# ---------------------------------------------------------------------------
# 1. Execution Agent のリソースポリシー
# ---------------------------------------------------------------------------
echo ""
echo "--- [1] Execution Agent のリソースポリシー（Principal の確認） ---"
EXEC_RUNTIME_ARN=$(get_stack_output "${EXECUTION_STACK_NAME}" "ExecutionAgentRuntimeArn")
if [[ -z "${EXEC_RUNTIME_ARN}" || "${EXEC_RUNTIME_ARN}" == "None" ]]; then
  echo "  (スキップ) ${EXECUTION_STACK_NAME} の ExecutionAgentRuntimeArn を取得できませんでした。Execution スタックがデプロイ済みか確認してください。"
else
  echo "  Execution Runtime ARN: ${EXEC_RUNTIME_ARN}"
  POLICY_JSON=$(aws bedrock-agentcore-control get-resource-policy ${_profile_args} --region "${AWS_REGION}" \
    --resource-arn "${EXEC_RUNTIME_ARN}" 2>/dev/null | jq -r '.policy // empty' || true)
  if [[ -z "${POLICY_JSON}" ]]; then
    # CLI が未対応 or 権限不足の場合は Python で取得
    export AWS_REGION
    [[ -n "${AWS_PROFILE:-}" ]] && export AWS_PROFILE
    POLICY_JSON=$(python3 -c "
import boto3, json, os
try:
    session = boto3.Session(region_name=os.environ.get('AWS_REGION', 'ap-northeast-1'))
    if os.environ.get('AWS_PROFILE'): session = boto3.Session(profile_name=os.environ['AWS_PROFILE'], region_name=session.region_name)
    client = session.client('bedrock-agentcore-control')
    r = client.get_resource_policy(resourceArn='${EXEC_RUNTIME_ARN}')
    print(r.get('policy', ''))
except Exception as e:
    print('')
" 2>/dev/null || true)
  fi
  if [[ -z "${POLICY_JSON}" ]]; then
    echo "  (警告) リソースポリシーが取得できませんでした（未設定または GetResourcePolicy 権限不足）。デプロイスクリプト Phase 2.5 を実行してリソースポリシーを適用してください。"
  else
    echo "  現在のポリシー:"
    echo "${POLICY_JSON}" | jq '.' 2>/dev/null || echo "${POLICY_JSON}"
    PRINCIPAL=$(echo "${POLICY_JSON}" | jq -r 'if .Statement[0].Principal.AWS then (.Statement[0].Principal.AWS | if type == "array" then .[0] else . end) else .Statement[0].Principal end' 2>/dev/null || true)
    echo ""
    echo "  Principal: ${PRINCIPAL}"
    if [[ "${PRINCIPAL}" == *"${EXPECTED_VERIFICATION_ROLE_NAME}"* ]]; then
      echo "  => OK: Verification の実行ロール (${EXPECTED_VERIFICATION_ROLE_NAME}) が許可されています。"
    else
      echo "  => 要確認: 期待するロール名は ${EXPECTED_VERIFICATION_ROLE_NAME} です。デプロイスクリプト Phase 2.5 を再実行してください。"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 2. Verification Agent の IAM ポリシー（Runtime + Endpoint の両方）
# ---------------------------------------------------------------------------
echo ""
echo "--- [2] Verification Agent の IAM（Runtime と Endpoint の両方の許可） ---"
ROLE_NAME="${EXPECTED_VERIFICATION_ROLE_NAME}"
if ! aws iam get-role ${_profile_args} --role-name "${ROLE_NAME}" &>/dev/null; then
  echo "  (スキップ) IAM ロール ${ROLE_NAME} が見つかりません。"
else
  echo "  ロール: ${ROLE_NAME}"
  INLINE_POLICIES=$(aws iam list-role-policies ${_profile_args} --role-name "${ROLE_NAME}" --query 'PolicyNames' --output text 2>/dev/null || true)
  FOUND_INVOKE=0
  HAS_RUNTIME=0
  HAS_ENDPOINT=0
  for pol in ${INLINE_POLICIES}; do
    DOC=$(aws iam get-role-policy ${_profile_args} --role-name "${ROLE_NAME}" --policy-name "${pol}" --query 'PolicyDocument' --output json 2>/dev/null || true)
    if echo "${DOC}" | jq -e '.Statement[] | select(.Sid == "AgentCoreInvoke")' &>/dev/null; then
      FOUND_INVOKE=1
      RESOURCES=$(echo "${DOC}" | jq -r '.Statement[] | select(.Sid == "AgentCoreInvoke") | .Resource' 2>/dev/null)
      if echo "${RESOURCES}" | grep -q "runtime/"; then HAS_RUNTIME=1; fi
      if echo "${RESOURCES}" | grep -q "runtime-endpoint/"; then HAS_ENDPOINT=1; fi
      echo "  AgentCoreInvoke の Resource:"
      echo "${DOC}" | jq '.Statement[] | select(.Sid == "AgentCoreInvoke") | .Resource' 2>/dev/null || true
      break
    fi
  done
  if [[ ${FOUND_INVOKE} -eq 0 ]]; then
    echo "  (警告) AgentCoreInvoke のポリシーステートメントが見つかりません。"
  else
    if [[ ${HAS_RUNTIME} -eq 1 ]] && [[ ${HAS_ENDPOINT} -eq 1 ]]; then
      echo "  => OK: Runtime と Endpoint の両方の ARN が許可されています。"
    else
      echo "  => 要確認: Runtime または Endpoint のいずれかが不足しています。Verification スタックを再デプロイしてください。"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 3. Verification Runtime ログの invoke_execution_agent_failed
# ---------------------------------------------------------------------------
echo ""
echo "--- [3] Verification Runtime ログ（invoke_execution_agent_failed） ---"
VERIFICATION_LOG_PREFIX="/aws/bedrock-agentcore/runtimes/SlackAI_VerificationAgent_${ENV_SUFFIX}"
LOG_GROUPS=$(aws logs describe-log-groups ${_profile_args} --region "${AWS_REGION}" \
  --log-group-name-prefix "${VERIFICATION_LOG_PREFIX}" \
  --query 'logGroups[*].logGroupName' --output text 2>/dev/null || true)
if [[ -z "${LOG_GROUPS}" ]]; then
  LOG_GROUPS=$(aws logs describe-log-groups ${_profile_args} --region "${AWS_REGION}" \
    --log-group-name-prefix "/aws/bedrock-agentcore/runtimes/SlackAI_VerificationAgent" \
    --query 'logGroups[*].logGroupName' --output text 2>/dev/null || true)
fi
if [[ -z "${LOG_GROUPS}" ]]; then
  echo "  (スキップ) Verification Agent の Runtime ロググループが見つかりません。"
else
  for lg in ${LOG_GROUPS}; do
    [[ "${lg}" != *"VerificationAgent"* ]] && continue
    echo "  Log group: ${lg}"
    aws logs tail "${lg}" ${_profile_args} --region "${AWS_REGION}" \
      --since 2h --format short --filter-pattern "invoke_execution_agent_failed" 2>/dev/null | head -25 || true
    echo ""
  done
  echo "  => 上に error_code / error_message が出ていれば、Execution 側の認可または IAM を確認してください。"
fi

echo "=============================================="
echo "確認完了"
echo "=============================================="
