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
#   export DEPLOYMENT_ENV=dev  # or 'prod'
#   ./scripts/deploy-split-stacks.sh
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

# Configuration
# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CDK_DIR="${PROJECT_ROOT}/cdk"
AWS_REGION="${AWS_REGION:-ap-northeast-1}"
AWS_PROFILE="${AWS_PROFILE:-}"

# Get deployment environment
DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-}"
if [[ -z "${DEPLOYMENT_ENV}" ]]; then
    # Try to get from cdk.json context
    if command -v jq &> /dev/null; then
        DEPLOYMENT_ENV=$(jq -r '.context.deploymentEnv // "dev"' "${CDK_DIR}/cdk.json" 2>/dev/null || echo "dev")
    else
        DEPLOYMENT_ENV="dev"
    fi
    log_warning "DEPLOYMENT_ENV not set. Using default: ${DEPLOYMENT_ENV}"
fi

# Normalize environment name (lowercase, trim)
DEPLOYMENT_ENV=$(echo "${DEPLOYMENT_ENV}" | tr '[:upper:]' '[:lower:]' | xargs)

# Validate deployment environment
VALID_ENVIRONMENTS=("dev" "prod")
if [[ ! " ${VALID_ENVIRONMENTS[@]} " =~ " ${DEPLOYMENT_ENV} " ]]; then
    log_error "Invalid deployment environment '${DEPLOYMENT_ENV}'. Must be one of: ${VALID_ENVIRONMENTS[*]}"
    exit 1
fi

# Set stack names based on environment
ENVIRONMENT_SUFFIX=""
if [[ "${DEPLOYMENT_ENV}" == "prod" ]]; then
    ENVIRONMENT_SUFFIX="Prod"
else
    ENVIRONMENT_SUFFIX="Dev"
fi

BASE_EXECUTION_STACK_NAME="${EXECUTION_STACK_NAME:-SlackAI-Execution}"
BASE_VERIFICATION_STACK_NAME="${VERIFICATION_STACK_NAME:-SlackAI-Verification}"
EXECUTION_STACK_NAME="${BASE_EXECUTION_STACK_NAME}-${ENVIRONMENT_SUFFIX}"
VERIFICATION_STACK_NAME="${BASE_VERIFICATION_STACK_NAME}-${ENVIRONMENT_SUFFIX}"

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

get_config_value() {
    local key=$1
    local config_file="${CDK_DIR}/cdk.config.${DEPLOYMENT_ENV}.json"
    
    if [[ ! -f "${config_file}" ]]; then
        echo ""
        return
    fi
    
    if command -v jq &> /dev/null; then
        jq -r ".\"${key}\" // empty" "${config_file}" 2>/dev/null || echo ""
    else
        # Fallback to grep/sed (less reliable)
        grep -o "\"${key}\": \"[^\"]*\"" "${config_file}" 2>/dev/null | sed 's/.*": "\([^"]*\)".*/\1/' || echo ""
    fi
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    log_info "Deployment environment: ${DEPLOYMENT_ENV}"
    log_info "Execution Stack: ${EXECUTION_STACK_NAME}"
    log_info "Verification Stack: ${VERIFICATION_STACK_NAME}"

    # Load Slack credentials from config file if not set as environment variables
    if [[ -z "${SLACK_BOT_TOKEN:-}" ]]; then
        log_info "SLACK_BOT_TOKEN not set, reading from config file..."
        SLACK_BOT_TOKEN=$(get_config_value "slackBotToken")
        if [[ -n "${SLACK_BOT_TOKEN}" ]]; then
            export SLACK_BOT_TOKEN
            log_info "Loaded SLACK_BOT_TOKEN from config file"
        fi
    fi

    if [[ -z "${SLACK_SIGNING_SECRET:-}" ]]; then
        log_info "SLACK_SIGNING_SECRET not set, reading from config file..."
        SLACK_SIGNING_SECRET=$(get_config_value "slackSigningSecret")
        if [[ -n "${SLACK_SIGNING_SECRET}" ]]; then
            export SLACK_SIGNING_SECRET
            log_info "Loaded SLACK_SIGNING_SECRET from config file"
        fi
    fi

    # Check if credentials are available (from env var or config file)
    if [[ -z "${SLACK_BOT_TOKEN:-}" ]]; then
        log_error "SLACK_BOT_TOKEN is required. Set it as environment variable or in ${CDK_DIR}/cdk.config.${DEPLOYMENT_ENV}.json"
        exit 1
    fi

    if [[ -z "${SLACK_SIGNING_SECRET:-}" ]]; then
        log_error "SLACK_SIGNING_SECRET is required. Set it as environment variable or in ${CDK_DIR}/cdk.config.${DEPLOYMENT_ENV}.json"
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
    local config_file="${CDK_DIR}/cdk.config.${DEPLOYMENT_ENV}.json"

    log_info "Updating ${config_file}: ${key}=${value}"

    # Ensure config file exists
    if [[ ! -f "${config_file}" ]]; then
        log_error "Configuration file not found: ${config_file}"
        log_info "Please create it using cdk.config.json.example as a template"
        exit 1
    fi

    # Use jq if available, otherwise use sed
    if command -v jq &> /dev/null; then
        local tmp_file=$(mktemp)
        jq ".\"${key}\" = \"${value}\"" "${config_file}" > "${tmp_file}"
        mv "${tmp_file}" "${config_file}"
    else
        # Fallback to sed (less reliable)
        if grep -q "\"${key}\"" "${config_file}"; then
            sed -i.bak "s/\"${key}\": \"[^\"]*\"/\"${key}\": \"${value}\"/" "${config_file}"
            rm -f "${config_file}.bak"
        else
            # Add new key if it doesn't exist (add before closing brace)
            sed -i.bak "s/}$/  \"${key}\": \"${value}\"\n}/" "${config_file}"
            rm -f "${config_file}.bak"
        fi
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

    # Set deployment environment in context
    update_cdk_context "deploymentEnv" "${DEPLOYMENT_ENV}"

    # Deploy Execution Stack
    local profile_args=""
    if [[ -n "${AWS_PROFILE}" ]]; then
        profile_args="--profile ${AWS_PROFILE}"
    fi
    
    log_info "Deploying ${EXECUTION_STACK_NAME}..."
    if ! npx cdk deploy "${EXECUTION_STACK_NAME}" ${profile_args} --require-approval never --context deploymentEnv="${DEPLOYMENT_ENV}"; then
        log_error "Failed to deploy ${EXECUTION_STACK_NAME}"
        exit 1
    fi

    cd "${PROJECT_ROOT}"

    # Wait a moment for CloudFormation to update stack outputs
    log_info "Waiting for stack outputs to be available..."
    sleep 5

    # Get API URL from stack outputs
    local api_url=$(get_stack_output "${EXECUTION_STACK_NAME}" "ExecutionApiUrl")

    if [[ -z "${api_url}" ]]; then
        log_error "Failed to get ExecutionApiUrl from stack outputs"
        log_info "Stack may still be updating. Please check CloudFormation console."
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
    
    log_info "Deploying ${VERIFICATION_STACK_NAME}..."
    if ! npx cdk deploy "${VERIFICATION_STACK_NAME}" ${profile_args} --require-approval never --context deploymentEnv="${DEPLOYMENT_ENV}"; then
        log_error "Failed to deploy ${VERIFICATION_STACK_NAME}"
        exit 1
    fi

    cd "${PROJECT_ROOT}"

    # Wait a moment for CloudFormation to update stack outputs
    log_info "Waiting for stack outputs to be available..."
    sleep 5

    # Get Lambda Role ARN from stack outputs
    local role_arn=$(get_stack_output "${VERIFICATION_STACK_NAME}" "VerificationLambdaRoleArn")
    local function_url=$(get_stack_output "${VERIFICATION_STACK_NAME}" "SlackEventHandlerUrl")

    if [[ -z "${role_arn}" ]]; then
        log_error "Failed to get VerificationLambdaRoleArn from stack outputs"
        log_info "Stack may still be updating. Please check CloudFormation console."
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
    npx cdk deploy "${EXECUTION_STACK_NAME}" ${profile_args} --require-approval never --context deploymentEnv="${DEPLOYMENT_ENV}"

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

