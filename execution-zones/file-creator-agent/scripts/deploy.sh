#!/bin/bash
#
# deploy.sh — Deploy File Creator Agent zone
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

log_info "Deploying File Creator Agent zone (env: ${DEPLOYMENT_ENV})"

if [[ ! -x "${CDK_CLI}" ]]; then
    log_info "Installing CDK dependencies..."
    npm install --prefix "${PROJECT_ROOT}"
    CDK_CLI="${PROJECT_ROOT}/node_modules/aws-cdk/bin/cdk"
fi

if [[ ! -d "${PROJECT_ROOT}/node_modules" ]]; then
    log_info "Installing workspace dependencies..."
    npm install --prefix "${PROJECT_ROOT}"
fi

CONTEXT_ARGS="--context deploymentEnv=${DEPLOYMENT_ENV}"
if [[ "${FORCE_REBUILD}" == "true" ]]; then
    CONTEXT_ARGS="${CONTEXT_ARGS} --context forceFileCreatorImageRebuild=$(date +%s)"
    log_info "Force image rebuild enabled"
fi

ENV_SUFFIX=$([[ "${DEPLOYMENT_ENV}" == "prod" ]] && echo "Prod" || echo "Dev")
FILE_CREATOR_STACK="SlackAI-FileCreator-${ENV_SUFFIX}"

log_info "Deploying stack: ${FILE_CREATOR_STACK}"
cd "${CDK_DIR}"
DEPLOYMENT_ENV="${DEPLOYMENT_ENV}" "${CDK_CLI}" deploy "${FILE_CREATOR_STACK}" \
    --require-approval never --force \
    ${CONTEXT_ARGS} \
    ${PROFILE_ARGS:+${PROFILE_ARGS}} \
    --region "${AWS_REGION}"

# ── DynamoDB Agent Registry ───────────────────────────────
register_agent_in_dynamodb() {
    local agent_id="file-creator"
    local verify_stack="SlackAI-Verification-${ENV_SUFFIX}"

    local table_name="${AGENT_REGISTRY_TABLE:-}"
    if [[ -z "${table_name}" ]]; then
        table_name=$(aws cloudformation describe-stacks \
            --stack-name "${verify_stack}" --region "${AWS_REGION}" ${PROFILE_ARGS} \
            --query "Stacks[0].Outputs[?OutputKey=='AgentRegistryTableName'].OutputValue" \
            --output text 2>/dev/null || echo "")
    fi
    if [[ -z "${table_name}" || "${table_name}" == "None" ]]; then
        log_warning "Agent registry table not found; skipping DynamoDB registration"
        return 0
    fi

    local runtime_arn
    runtime_arn=$(aws cloudformation describe-stacks \
        --stack-name "${FILE_CREATOR_STACK}" --region "${AWS_REGION}" ${PROFILE_ARGS} \
        --query "Stacks[0].Outputs[?OutputKey=='FileCreatorAgentRuntimeArn'].OutputValue" \
        --output text 2>/dev/null || echo "")
    if [[ -z "${runtime_arn}" || "${runtime_arn}" == "None" ]]; then
        log_warning "FileCreatorAgentRuntimeArn not found; skipping DynamoDB registration"
        return 0
    fi

    local updated_at
    updated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    log_info "Registering ${agent_id} in DynamoDB registry: ${table_name}"
    aws dynamodb put-item \
        --table-name "${table_name}" \
        --region "${AWS_REGION}" ${PROFILE_ARGS} \
        --item "{
            \"env\": {\"S\": \"${DEPLOYMENT_ENV}\"},
            \"agent_id\": {\"S\": \"${agent_id}\"},
            \"arn\": {\"S\": \"${runtime_arn}\"},
            \"api\": {\"M\": {\"protocol\": {\"S\": \"a2a\"}, \"transport\": {\"S\": \"agentcore\"}, \"agent_card_method\": {\"S\": \"get_agent_card\"}, \"well_known_path\": {\"S\": \"/.well-known/agent-card.json\"}}},
            \"description\": {\"S\": \"ファイル生成特化エージェント。Excel、Word、PowerPoint、グラフ画像、テキストファイルの生成に対応。ビジネス文書やプレゼン資料のガイドライン取得も可能。\"},
            \"skills\": {\"L\": [{\"M\": {\"id\": {\"S\": \"generate_excel\"}, \"name\": {\"S\": \"Generate Excel File\"}, \"description\": {\"S\": \"Generate Excel spreadsheet files\"}}}, {\"M\": {\"id\": {\"S\": \"generate_word\"}, \"name\": {\"S\": \"Generate Word Document\"}, \"description\": {\"S\": \"Generate Word document files\"}}}, {\"M\": {\"id\": {\"S\": \"generate_powerpoint\"}, \"name\": {\"S\": \"Generate PowerPoint Presentation\"}, \"description\": {\"S\": \"Generate PowerPoint presentation files\"}}}, {\"M\": {\"id\": {\"S\": \"generate_chart_image\"}, \"name\": {\"S\": \"Generate Chart Image\"}, \"description\": {\"S\": \"Generate chart and graph images\"}}}, {\"M\": {\"id\": {\"S\": \"generate_text_file\"}, \"name\": {\"S\": \"Generate Text File\"}, \"description\": {\"S\": \"Generate plain text files\"}}}, {\"M\": {\"id\": {\"S\": \"get_business_document_guidelines\"}, \"name\": {\"S\": \"Get Business Document Guidelines\"}, \"description\": {\"S\": \"Get guidelines for creating business documents\"}}}, {\"M\": {\"id\": {\"S\": \"get_presentation_slide_guidelines\"}, \"name\": {\"S\": \"Get Presentation Slide Guidelines\"}, \"description\": {\"S\": \"Get guidelines for creating presentation slides\"}}}]},
            \"updated_at\": {\"S\": \"${updated_at}\"}
        }" \
        && log_success "Agent ${agent_id} registered in DynamoDB" \
        || log_warning "Failed to register ${agent_id} in DynamoDB (non-fatal)"
}

register_agent_in_dynamodb

log_success "File Creator Agent zone deployed successfully"
