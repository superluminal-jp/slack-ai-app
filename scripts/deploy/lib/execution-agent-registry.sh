#!/bin/bash
#
# execution-agent-registry.sh — helpers to build executionAgentArns map from deployed stacks
#

set -euo pipefail

_to_env_suffix() {
    local deployment_env="${1:-dev}"
    if [[ "${deployment_env}" == "prod" ]]; then
        echo "Prod"
    else
        echo "Dev"
    fi
}

_to_kebab_case() {
    local input="${1:-}"
    echo "${input}" \
        | sed -E 's/([a-z0-9])([A-Z])/\1-\2/g' \
        | tr '[:upper:]' '[:lower:]'
}

_infer_agent_id() {
    local output_key="${1:-}"

    case "${output_key}" in
        ExecutionAgentRuntimeArn) echo "file-creator"; return 0 ;;
        WebFetchAgentRuntimeArn) echo "fetch-url"; return 0 ;;
        VerificationAgentRuntimeArn) echo ""; return 0 ;;
    esac

    local base="${output_key%AgentRuntimeArn}"
    if [[ -z "${base}" || "${base}" == "${output_key}" ]]; then
        echo ""
        return 0
    fi

    local inferred
    inferred="$(_to_kebab_case "${base}")"

    case "${inferred}" in
        execution) echo "file-creator" ;;
        web-fetch) echo "fetch-url" ;;
        *) echo "${inferred}" ;;
    esac
}

# Build executionAgentArns JSON by scanning deployed CloudFormation stacks.
# Args:
#   1: deployment env (dev|prod)
#   2: aws region
# Output:
#   compact JSON object (e.g. {"file-creator":"arn:...","docs":"arn:..."})
build_execution_agent_arns_json() {
    local deployment_env="${1:-dev}"
    local aws_region="${2:-ap-northeast-1}"
    local env_suffix stack_names_raw stack_names stack output_rows row output_key output_value
    local agent_id arns_json='{}'
    local -a status_filter=(
        CREATE_COMPLETE
        UPDATE_COMPLETE
        UPDATE_ROLLBACK_COMPLETE
        IMPORT_COMPLETE
        IMPORT_ROLLBACK_COMPLETE
    )

    env_suffix="$(_to_env_suffix "${deployment_env}")"

    stack_names_raw=$(
        aws cloudformation list-stacks \
            --stack-status-filter "${status_filter[@]}" \
            --region "${aws_region}" \
            ${PROFILE_ARGS:+${PROFILE_ARGS}} \
            --query "StackSummaries[?ends_with(StackName, '-${env_suffix}')].StackName" \
            --output text 2>/dev/null || true
    )

    stack_names=$(
        echo "${stack_names_raw}" \
            | tr '\t' '\n' \
            | sed '/^$/d' \
            | sort -u
    )

    while IFS= read -r stack; do
        [[ -z "${stack}" ]] && continue

        output_rows=$(
            aws cloudformation describe-stacks \
                --stack-name "${stack}" \
                --region "${aws_region}" \
                ${PROFILE_ARGS:+${PROFILE_ARGS}} \
                --query "Stacks[0].Outputs[?ends_with(OutputKey, 'AgentRuntimeArn')].[OutputKey,OutputValue]" \
                --output text 2>/dev/null || true
        )

        while IFS= read -r row; do
            [[ -z "${row}" ]] && continue
            output_key="$(echo "${row}" | awk '{print $1}')"
            output_value="$(echo "${row}" | awk '{print $2}')"
            [[ -z "${output_key}" || -z "${output_value}" ]] && continue
            [[ "${output_key}" == "VerificationAgentRuntimeArn" ]] && continue

            agent_id="$(_infer_agent_id "${output_key}")"
            [[ -z "${agent_id}" ]] && continue

            arns_json=$(
                echo "${arns_json}" \
                    | jq -c --arg id "${agent_id}" --arg arn "${output_value}" '. + {($id): $arn}'
            )
        done <<< "${output_rows}"
    done <<< "${stack_names}"

    echo "${arns_json}"
}
