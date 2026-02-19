#!/bin/bash
#
# deploy-all.sh — Deploy all zones: execution first, then verification
#
# Usage:
#   export DEPLOYMENT_ENV=dev
#   ./scripts/deploy/deploy-all.sh [--force-rebuild]
#
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-}"
if [[ -z "${DEPLOYMENT_ENV}" ]]; then
    DEPLOYMENT_ENV="dev"
    log_warning "DEPLOYMENT_ENV not set. Using default: ${DEPLOYMENT_ENV}"
fi

FORCE_REBUILD_ARG=""
for arg in "$@"; do
    [[ "${arg}" == "--force-rebuild" ]] && FORCE_REBUILD_ARG="--force-rebuild"
done

log_info "Full deployment (env: ${DEPLOYMENT_ENV})"
log_info "Order: execution zones → verification zone"

log_info "=== Step 1: Deploy execution zones ==="
DEPLOYMENT_ENV="${DEPLOYMENT_ENV}" \
    bash "${SCRIPT_DIR}/deploy-execution-all.sh" ${FORCE_REBUILD_ARG}

log_info "=== Step 2: Deploy verification zone ==="
DEPLOYMENT_ENV="${DEPLOYMENT_ENV}" \
    bash "${SCRIPT_DIR}/deploy-verification-all.sh"

log_success "Full deployment completed successfully"
