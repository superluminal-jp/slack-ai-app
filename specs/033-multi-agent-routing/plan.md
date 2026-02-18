# Implementation Plan: 033 Multi-Agent Routing

## Phase 1
- Add `get_agent_card` JSON-RPC method handling to Execution Agent.

## Phase 2
- Remove `search_docs` from Execution Agent tools/system prompt.

## Phase 3
- Create new Docs Agent runtime package under `cdk/lib/docs-execution/agent/docs-agent`.

## Phase 4
- Add Docs Execution CDK stack + constructs.

## Phase 5
- Extend Verification runtime props/env/IAM for multiple runtime ARNs and router model invoke.

## Phase 6
- Add `agent_registry.py` with startup initialization and card discovery support.

## Phase 7
- Add `router.py` for request classification and agent id selection.

## Phase 8
- Integrate routing in `pipeline.py` before `invoke_execution_agent`.

## Phase 9
- Update `scripts/deploy.sh` to deploy Docs stack and wire `docsAgentArn`.
