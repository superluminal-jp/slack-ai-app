#!/bin/bash
#
# preflight.sh — Pre-deployment validation
#
# Checks: AWS credentials, required tools, environment variables
#
# Usage:
#   export DEPLOYMENT_ENV=dev
#   ./scripts/validate/preflight.sh
#
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[FAIL]${NC} $1"; }

ERRORS=0

check() {
    local name="$1"
    local cmd="$2"
    if eval "${cmd}" &>/dev/null; then
        log_success "${name}"
    else
        log_error "${name}"
        ERRORS=$((ERRORS + 1))
    fi
}

log_info "Running pre-flight checks..."

# Tools
check "node >= 18" "node -e 'process.exit(parseInt(process.version.slice(1)) >= 18 ? 0 : 1)'"
check "npm available" "npm --version"
check "docker available" "docker info"
check "aws CLI available" "aws --version"

# AWS credentials
check "AWS credentials configured" "aws sts get-caller-identity"

# Environment
DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-dev}"
log_info "DEPLOYMENT_ENV: ${DEPLOYMENT_ENV}"
if [[ "${DEPLOYMENT_ENV}" != "dev" && "${DEPLOYMENT_ENV}" != "prod" ]]; then
    log_error "DEPLOYMENT_ENV must be 'dev' or 'prod', got: ${DEPLOYMENT_ENV}"
    ERRORS=$((ERRORS + 1))
else
    log_success "DEPLOYMENT_ENV valid"
fi

# Config files
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

for agent in execution-agent time-agent docs-agent; do
    config_file="${PROJECT_ROOT}/execution-zones/${agent}/cdk/cdk.config.${DEPLOYMENT_ENV}.json"
    if [[ -f "${config_file}" ]]; then
        log_success "Config: execution-zones/${agent}/cdk/cdk.config.${DEPLOYMENT_ENV}.json"
    else
        log_error "Missing config: execution-zones/${agent}/cdk/cdk.config.${DEPLOYMENT_ENV}.json"
        ERRORS=$((ERRORS + 1))
    fi
done

verification_config="${PROJECT_ROOT}/verification-zones/verification-agent/cdk/cdk.config.${DEPLOYMENT_ENV}.json"
if [[ -f "${verification_config}" ]]; then
    log_success "Config: verification-zones/verification-agent/cdk/cdk.config.${DEPLOYMENT_ENV}.json"
else
    log_warning "Missing config: verification-zones/verification-agent/cdk/cdk.config.${DEPLOYMENT_ENV}.json (may use env vars)"
fi

echo ""
if [[ "${ERRORS}" -eq 0 ]]; then
    log_success "All pre-flight checks passed"
    exit 0
else
    log_error "${ERRORS} check(s) failed. Fix issues before deploying."
    exit 1
fi
