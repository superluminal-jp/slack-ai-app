#!/bin/bash
#
# deploy-execution-all.sh — Deploy all execution zones sequentially
#
# Discovers zones automatically from execution-zones/*/scripts/deploy.sh
# and deploys them in order (execution-agent first, then others alphabetically).
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

discover_execution_zones() {
    local zones=() zone_dir zone
    while IFS= read -r zone_dir; do
        [[ -z "${zone_dir}" ]] && continue
        zone="$(basename "${zone_dir}")"
        if [[ -x "${zone_dir}/scripts/deploy.sh" ]]; then
            zones+=("${zone}")
        fi
    done < <(find "${PROJECT_ROOT}/execution-zones" -mindepth 1 -maxdepth 1 -type d | sort)

    if [[ ${#zones[@]} -eq 0 ]]; then
        log_error "No deployable execution zones found under ${PROJECT_ROOT}/execution-zones"
        exit 1
    fi

    # Ensure file-creator (execution-agent) deploys first when present.
    local ordered=()
    for i in "${!zones[@]}"; do
        if [[ "${zones[$i]}" == "execution-agent" ]]; then
            ordered+=("${zones[$i]}")
            unset 'zones[$i]'
            break
        fi
    done
    for zone in "${zones[@]}"; do
        [[ -n "${zone}" ]] && ordered+=("${zone}")
    done

    echo "${ordered[@]}"
}

IFS=' ' read -r -a EXECUTION_ZONES <<< "$(discover_execution_zones)"
log_info "Discovered execution zones: ${EXECUTION_ZONES[*]}"

for agent in "${EXECUTION_ZONES[@]}"; do
    log_info "--- Deploying ${agent} ---"
    DEPLOYMENT_ENV="${DEPLOYMENT_ENV}" \
        bash "${PROJECT_ROOT}/execution-zones/${agent}/scripts/deploy.sh" \
        ${FORCE_REBUILD_ARG}
    log_success "${agent} deployed"
done

log_success "All execution zones deployed successfully"
