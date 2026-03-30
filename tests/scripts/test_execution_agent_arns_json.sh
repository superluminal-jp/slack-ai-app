#!/usr/bin/env bash
# Asserts executionAgentArns JSON omits time and fetch-url when those ARNs are empty.
# Mirrors build_execution_agent_arns_json in scripts/deploy.sh — keep in sync.

set -euo pipefail

build_execution_agent_arns_json() {
    local file_creator="$1" docs="$2" time_arn="$3" fetch_url="$4"
    jq -cn \
        --arg file_creator "${file_creator}" \
        --arg docs "${docs}" \
        --arg time "${time_arn}" \
        --arg fetch_url "${fetch_url}" \
        '{ "file-creator": $file_creator }
         + (if $docs == "" or $docs == "None" then {} else { docs: $docs } end)
         + (if $time == "" or $time == "None" then {} else { time: $time } end)
         + (if $fetch_url == "" or $fetch_url == "None" then {} else { "fetch-url": $fetch_url } end)'
}

main() {
    command -v jq >/dev/null 2>&1 || {
        echo "jq is required" >&2
        exit 1
    }

    local out
    out=$(build_execution_agent_arns_json \
        "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/abc" \
        "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/def" \
        "" \
        "")

    if echo "${out}" | jq -e 'has("time")' >/dev/null 2>&1; then
        echo "FAIL: expected no 'time' key, got: ${out}" >&2
        exit 1
    fi
    if echo "${out}" | jq -e 'has("fetch-url")' >/dev/null 2>&1; then
        echo "FAIL: expected no 'fetch-url' key, got: ${out}" >&2
        exit 1
    fi

    local fc docs
    fc=$(echo "${out}" | jq -r '."file-creator"')
    docs=$(echo "${out}" | jq -r '.docs')
    [[ "${fc}" == *"runtime/abc"* ]] || {
        echo "FAIL: file-creator ARN mismatch" >&2
        exit 1
    }
    [[ "${docs}" == *"runtime/def"* ]] || {
        echo "FAIL: docs ARN mismatch" >&2
        exit 1
    }

    echo "OK: build_execution_agent_arns_json omits time and fetch-url when empty"
}

main "$@"
