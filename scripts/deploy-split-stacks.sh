#!/bin/bash
#
# deploy-split-stacks.sh
#
# Deploys the Slack AI application using two independent stacks.
# This script handles the 3-phase deployment process:
#   1. Deploy ExecutionStack (get API URL)
#   2. Deploy VerificationStack (get Lambda Role ARN)
#   3. Update ExecutionStack with resource policy
#
# Usage:
#   ./scripts/deploy-split-stacks.sh
#
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - SLACK_BOT_TOKEN environment variable set
#   - SLACK_SIGNING_SECRET environment variable set
#   - Node.js and npm installed
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CDK_DIR="${PROJECT_ROOT}/cdk"
EXECUTION_STACK_NAME="${EXECUTION_STACK_NAME:-SlackAI-Execution}"
VERIFICATION_STACK_NAME="${VERIFICATION_STACK_NAME:-SlackAI-Verification}"
AWS_REGION="${AWS_REGION:-ap-northeast-1}"
AWS_PROFILE="${AWS_PROFILE:-}"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check for required environment variables
    if [[ -z "${SLACK_BOT_TOKEN:-}" ]]; then
        log_error "SLACK_BOT_TOKEN environment variable is required"
        exit 1
    fi

    if [[ -z "${SLACK_SIGNING_SECRET:-}" ]]; then
        log_error "SLACK_SIGNING_SECRET environment variable is required"
        exit 1
    fi

    # Check for AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        exit 1
    fi

    # Check for Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi

    # Check for CDK
    if ! command -v npx &> /dev/null; then
        log_error "npx is not installed"
        exit 1
    fi

    log_success "Prerequisites check passed"
}

update_cdk_context() {
    local key=$1
    local value=$2
    local cdk_json="${CDK_DIR}/cdk.json"

    log_info "Updating cdk.json: ${key}=${value}"

    # Use jq if available, otherwise use sed
    if command -v jq &> /dev/null; then
        local tmp_file=$(mktemp)
        jq ".context.\"${key}\" = \"${value}\"" "${cdk_json}" > "${tmp_file}"
        mv "${tmp_file}" "${cdk_json}"
    else
        # Fallback to sed (less reliable)
        sed -i.bak "s/\"${key}\": \"[^\"]*\"/\"${key}\": \"${value}\"/" "${cdk_json}"
        rm -f "${cdk_json}.bak"
    fi
}

get_stack_output() {
    local stack_name=$1
    local output_key=$2

    local profile_args=""
    if [[ -n "${AWS_PROFILE}" ]]; then
        profile_args="--profile ${AWS_PROFILE}"
    fi

    aws cloudformation describe-stacks \
        --stack-name "${stack_name}" \
        --region "${AWS_REGION}" \
        ${profile_args} \
        --query "Stacks[0].Outputs[?OutputKey=='${output_key}'].OutputValue" \
        --output text 2>/dev/null || echo ""
}

deploy_execution_stack() {
    log_info "=========================================="
    log_info "Phase 1: Deploying Execution Stack"
    log_info "=========================================="

    cd "${PROJECT_ROOT}"
    cd "${CDK_DIR}"

    # Ensure deployment mode is split
    update_cdk_context "deploymentMode" "split"

    # Deploy Execution Stack
    local profile_args=""
    if [[ -n "${AWS_PROFILE}" ]]; then
        profile_args="--profile ${AWS_PROFILE}"
    fi
    npx cdk deploy "${EXECUTION_STACK_NAME}" ${profile_args} --require-approval never

    cd "${PROJECT_ROOT}"

    # Get API URL from stack outputs
    local api_url=$(get_stack_output "${EXECUTION_STACK_NAME}" "ExecutionApiUrl")

    if [[ -z "${api_url}" ]]; then
        log_error "Failed to get ExecutionApiUrl from stack outputs"
        exit 1
    fi

    log_success "Execution Stack deployed successfully"
    log_info "Execution API URL: ${api_url}"

    # Update cdk.json with API URL
    update_cdk_context "executionApiUrl" "${api_url}"

    echo "${api_url}"
}

deploy_verification_stack() {
    log_info "=========================================="
    log_info "Phase 2: Deploying Verification Stack"
    log_info "=========================================="

    cd "${PROJECT_ROOT}"
    cd "${CDK_DIR}"

    # Deploy Verification Stack
    local profile_args=""
    if [[ -n "${AWS_PROFILE}" ]]; then
        profile_args="--profile ${AWS_PROFILE}"
    fi
    npx cdk deploy "${VERIFICATION_STACK_NAME}" ${profile_args} --require-approval never

    cd "${PROJECT_ROOT}"

    # Get Lambda Role ARN from stack outputs
    local role_arn=$(get_stack_output "${VERIFICATION_STACK_NAME}" "VerificationLambdaRoleArn")
    local function_url=$(get_stack_output "${VERIFICATION_STACK_NAME}" "SlackEventHandlerUrl")

    if [[ -z "${role_arn}" ]]; then
        log_error "Failed to get VerificationLambdaRoleArn from stack outputs"
        exit 1
    fi

    log_success "Verification Stack deployed successfully"
    log_info "Verification Lambda Role ARN: ${role_arn}"
    log_info "Slack Event Handler URL: ${function_url}"

    # Update cdk.json with role ARN
    update_cdk_context "verificationLambdaRoleArn" "${role_arn}"

    echo "${role_arn}"
}

update_execution_stack() {
    log_info "=========================================="
    log_info "Phase 3: Updating Execution Stack Resource Policy"
    log_info "=========================================="

    cd "${PROJECT_ROOT}"
    cd "${CDK_DIR}"

    # Re-deploy Execution Stack with resource policy
    local profile_args=""
    if [[ -n "${AWS_PROFILE}" ]]; then
        profile_args="--profile ${AWS_PROFILE}"
    fi
    npx cdk deploy "${EXECUTION_STACK_NAME}" ${profile_args} --require-approval never

    cd "${PROJECT_ROOT}"

    log_success "Execution Stack updated with resource policy"
}

print_summary() {
    local function_url=$(get_stack_output "${VERIFICATION_STACK_NAME}" "SlackEventHandlerUrl")
    local api_url=$(get_stack_output "${EXECUTION_STACK_NAME}" "ExecutionApiUrl")

    echo ""
    log_info "=========================================="
    log_success "Deployment Complete!"
    log_info "=========================================="
    echo ""
    echo "Slack Event Handler URL (for Slack Event Subscriptions):"
    echo "  ${function_url}"
    echo ""
    echo "Execution API URL (internal):"
    echo "  ${api_url}"
    echo ""
    echo "Next steps:"
    echo "  1. Configure Slack app Event Subscriptions with the Function URL above"
    echo "  2. Test by sending a message to your Slack bot"
    echo ""
}

# Main execution
main() {
    log_info "Starting deployment with two independent stacks..."
    echo ""

    check_prerequisites

    # Phase 1: Deploy Execution Stack
    deploy_execution_stack

    # Phase 2: Deploy Verification Stack
    deploy_verification_stack

    # Phase 3: Update Execution Stack with resource policy
    update_execution_stack

    # Print summary
    print_summary
}

# Run main function
main "$@"

