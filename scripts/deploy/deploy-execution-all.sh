#!/bin/bash
#
# deploy-execution-all.sh — Deploy all execution zones sequentially
#
# Deploys: execution-agent → time-agent → docs-agent
#
# Usage:
#   export DEPLOYMENT_ENV=dev
#   ./scripts/deploy/deploy-execution-all.sh [--force-rebuild]
#
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-}"
if [[ -z "${DEPLOYMENT_ENV}" ]]; then
    DEPLOYMENT_ENV="dev"
    log_warning "DEPLOYMENT_ENV not set. Using default: ${DEPLOYMENT_ENV}"
fi

FORCE_REBUILD_ARG=""
for arg in "$@"; do
    [[ "${arg}" == "--force-rebuild" ]] && FORCE_REBUILD_ARG="--force-rebuild"
done

log_info "Deploying all execution zones (env: ${DEPLOYMENT_ENV})"

for agent in execution-agent time-agent docs-agent; do
    log_info "--- Deploying ${agent} ---"
    DEPLOYMENT_ENV="${DEPLOYMENT_ENV}" \
        bash "${PROJECT_ROOT}/execution-zones/${agent}/scripts/deploy.sh" \
        ${FORCE_REBUILD_ARG}
    log_success "${agent} deployed"
done

log_success "All execution zones deployed successfully"
