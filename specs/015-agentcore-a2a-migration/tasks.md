# Tasks: AgentCore A2A Migration — Deprecate Legacy Infrastructure

**Input**: Design documents from `specs/015-agentcore-a2a-migration/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: TDD and best practices — test tasks added: CDK tests updated/added first (expect no legacy resources), then implementation; Lambda tests updated to A2A-only behavior.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story (US1–US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Verify environment and test tooling; add failing tests (TDD) that encode post-migration expectations.

- [x] T001 Verify CDK test suite runs: `cd cdk && npm ci && npm test` from repo root
- [x] T002 [P] Verify SlackEventHandler Lambda tests run: `cd cdk/lib/verification/lambda/slack-event-handler && pip install -r requirements.txt && pytest tests/ -v` from repo root

---

## Phase 2: Foundational (TDD — Tests First)

**Purpose**: Add or update tests so they fail until legacy is removed (red), then implementation will make them pass (green).

- [x] T003 [P] [US2] In cdk/test/execution-stack.test.ts add assertions: template must NOT contain AWS::ApiGateway::RestApi, template must NOT contain BedrockProcessor Lambda (AWS::Lambda::Function with BedrockProcessor), template must NOT have outputs ExecutionApiUrl, ExecutionApiArn, BedrockProcessorArn; template MUST have output ExecutionAgentRuntimeArn
- [x] T004 [P] [US2] In cdk/test/verification-stack.test.ts add assertions: template must NOT contain AWS::SQS::Queue for ExecutionResponseQueue, template must NOT contain SlackResponseHandler Lambda; remove or relax any output assertion for ExecutionResponseQueueUrl/ExecutionResponseQueueArn
- [x] T005 [P] [US1] In cdk/lib/verification/lambda/slack-event-handler/tests/ refactor test_agentcore_feature_flag.py to test_a2a_invocation.py: keep only tests that assert handler invokes AgentCore when VERIFICATION_AGENT_ARN is set and handles missing ARN; remove all USE_AGENTCORE and legacy-path tests
- [x] T006 [P] [US1] In cdk/lib/verification/lambda/slack-event-handler/tests/test_handler.py replace all patches of invoke_execution_api with patches of boto3.client('bedrock-agentcore').invoke_agent_runtime and assert A2A path is used

---

## Phase 3: User Story 1 — Unified A2A Communication Path (Priority: P1) — MVP

**Goal**: All Slack-to-AI traffic flows only through AgentCore A2A; no alternative path and no USE_AGENTCORE branching.

**Independent Test**: Send a Slack app_mention; confirm reply via A2A. Grep for USE_AGENTCORE in handler/construct returns zero.

### Implementation for User Story 1

- [x] T007 [US1] In cdk/lib/verification/lambda/slack-event-handler/handler.py ensure no legacy branch: remove any call to invoke_execution_api or API Gateway client; ensure only path is VERIFICATION_AGENT_ARN and bedrock-agentcore InvokeAgentRuntime
- [x] T008 [US1] In cdk/lib/verification/constructs/slack-event-handler.ts remove USE_AGENTCORE from environment variables if present; pass only VERIFICATION_AGENT_ARN for A2A
- [x] T009 [US1] Remove legacy API Gateway client usage: delete or stop importing cdk/lib/verification/lambda/slack-event-handler/api_gateway_client.py from handler; delete cdk/lib/verification/lambda/slack-event-handler/tests/test_api_gateway_client.py
- [x] T010 [US1] Run pytest in cdk/lib/verification/lambda/slack-event-handler/tests/ and fix any failures after A2A-only changes

**Checkpoint**: SlackEventHandler always invokes Verification Agent via AgentCore; no legacy path in code.

---

## Phase 4: User Story 2 — Legacy Infrastructure Removal (Priority: P2)

**Goal**: Remove BedrockProcessor, ExecutionApi, ExecutionResponseQueue, SlackResponseHandler from CDK and delete their construct/Lambda code.

**Independent Test**: Deploy both stacks; CloudFormation has no API Gateway, BedrockProcessor Lambda, SlackResponseHandler Lambda, or ExecutionResponseQueue. CDK tests from Phase 2 pass.

### Implementation for User Story 2

- [x] T011 [US2] In cdk/lib/execution/execution-stack.ts remove BedrockProcessor construct and all references; remove ExecutionApi and ApiGatewayMonitoring; remove executionResponseQueueUrl and verificationLambdaRoleArn usage for legacy; remove CloudWatch alarms for BedrockProcessor and API Gateway; remove outputs ExecutionApiUrl, ExecutionApiArn, BedrockProcessorArn, ExecutionApiKeyId; keep only Execution Agent ECR + Runtime and output ExecutionAgentRuntimeArn; always create AgentCore (remove useAgentCore conditional)
- [x] T012 [US2] In cdk/lib/verification/verification-stack.ts remove ExecutionResponseQueue and ExecutionResponseDlq; remove SlackResponseHandler construct; remove executionLambdaRoleArn/addExecutionZonePermission usage for SQS; remove outputs ExecutionResponseQueueUrl, ExecutionResponseQueueArn; remove CloudWatch alarm for SlackResponseHandler; keep SlackEventHandler, Verification Agent Runtime, DynamoDB, Secrets
- [x] T013 [US2] Update cdk/lib/types/stack-config.ts: remove executionApiUrl, executionApiArn, executionResponseQueueUrl, verificationLambdaRoleArn, executionLambdaRoleArn, useAgentCore from ExecutionStackProps and VerificationStackProps; remove ExecutionStackOutputs.apiUrl/apiArn if unused; keep executionAgentArn, verificationAgentArn
- [x] T014 [US2] Delete cdk/lib/execution/constructs/bedrock-processor.ts
- [x] T015 [US2] Delete cdk/lib/execution/constructs/execution-api.ts
- [x] T016 [US2] Delete cdk/lib/execution/constructs/api-gateway-monitoring.ts
- [x] T017 [US2] Delete directory cdk/lib/execution/lambda/bedrock-processor/
- [x] T018 [US2] Delete cdk/lib/verification/constructs/slack-response-handler.ts
- [x] T019 [US2] Delete directory cdk/lib/verification/lambda/slack-response-handler/
- [x] T020 [US2] Run cdk/test/execution-stack.test.ts and cdk/test/verification-stack.test.ts; fix assertions so tests pass (legacy resources gone)

**Checkpoint**: CDK synthesizes without legacy resources; Phase 2 T003/T004 expectations met.

---

## Phase 5: User Story 3 — Clean Feature Flag Removal (Priority: P2)

**Goal**: Zero references to USE_AGENTCORE or useAgentCore in codebase and config.

**Independent Test**: Grep for USE_AGENTCORE and useAgentCore returns zero in application code, CDK, and config.

### Implementation for User Story 3

- [x] T021 [US3] In cdk/bin/cdk.ts remove useAgentCore config and context; remove executionApiUrl, executionResponseQueueUrl, verificationLambdaRoleArn from load and context; remove getApiArnFromUrl and any ExecutionApiUrl-based flow; update deployment comments to A2A-only (ExecutionAgentRuntimeArn only); ensure VerificationStack only receives executionAgentArn (and executionAccountId if cross-account)
- [x] T022 [US3] In cdk/lib/types/cdk-config.ts remove useAgentCore, executionApiUrl, executionResponseQueueUrl, verificationLambdaRoleArn from CdkConfig and schema
- [x] T023 [US3] In cdk/lib/execution/execution-stack.ts remove useAgentCore conditional; always create ExecutionAgentEcr and ExecutionAgentRuntime; remove props.executionResponseQueueUrl, props.verificationLambdaRoleArn, addVerificationLayerPermission, addSqsSendPermission
- [x] T024 [US3] In README.md and README.ja.md remove all mentions of USE_AGENTCORE, legacy path, ExecutionApiUrl, ExecutionResponseQueueUrl; describe A2A-only architecture and deployment
- [x] T025 [US3] In docs/ update zone-communication.md, overview.md, cross-account.md, implementation-details.md, system-architecture-diagram.md, monitoring.md, appendix.md, tutorials/getting-started.md: remove USE_AGENTCORE and legacy path; state A2A-only
- [x] T026 [US3] In scripts/deploy-split-stacks.sh remove USE_AGENTCORE checks and legacy validation; use only executionAgentArn and A2A deployment flow per quickstart.md
- [x] T027 [US3] In cdk/README.md remove ExecutionApiUrl, ExecutionResponseQueueUrl, useAgentCore from deployment steps and outputs table; document executionAgentArn-only flow
- [x] T028 [US3] Update CHANGELOG.md with 015-agentcore-a2a-migration: removed legacy Lambda/API Gateway/SQS and USE_AGENTCORE; A2A-only
- [x] T029 [US3] Grep codebase for USE_AGENTCORE and useAgentCore; remove or update any remaining references (e.g. specs/013 docs can stay historical; application and CDK must be zero)

**Checkpoint**: No USE_AGENTCORE or useAgentCore in application code or CDK config.

---

## Phase 6: User Story 4 — AWS Best Practices Validation via AWS MCP (Priority: P3)

**Goal**: Implementation and deployment validated against AWS best practices using AWS MCP; no critical findings.

**Independent Test**: Run AWS MCP (e.g. cfn-lint, cfn-guard, docs lookup) on synthesized templates and document results.

### Implementation for User Story 4

- [x] T030 [US4] Document AWS MCP validation steps in specs/015-agentcore-a2a-migration/ (e.g. VALIDATION.md): list checks (IAM least-privilege, encryption, observability), how to run cfn-lint/cfn-guard on synthesized templates, and how to use AWS Documentation/Knowledge MCP for best practices
- [x] T031 [US4] Run CloudFormation template validation: synthesize Execution and Verification stacks and run cfn-lint (or MCP validate_cloudformation_template) on generated template; fix any reported errors and document in VALIDATION.md
- [x] T032 [US4] Run compliance check (e.g. cfn-guard or MCP check_cloudformation_template_compliance) on synthesized templates; document and remediate critical findings

**Checkpoint**: Templates pass validation; validation and remediation documented.

---

## Phase 7: Polish & Cross-Cutting

**Purpose**: Docs, tests, and deployment alignment.

- [x] T033 [P] Update docs/reference/operations/slack-setup.md and docs/quickstart.md if they reference legacy or USE_AGENTCORE
- [x] T034 Run full CDK test suite: `cd cdk && npm test`; fix any remaining failures
- [x] T035 Run SlackEventHandler and Execution/Verification agent pytest where applicable; ensure all pass
- [x] T036 Confirm quickstart.md deployment steps work: deploy ExecutionStack then VerificationStack with only executionAgentArn; validate no legacy resources in console
- [x] T037 [P] Update cross-account and agentcore tests in cdk/test/cross-account.test.ts and cdk/test/agentcore-constructs.test.ts to remove legacy outputs (ExecutionApiUrl, etc.) and assert ExecutionAgentRuntimeArn where needed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: No dependencies.
- **Phase 2**: Depends on Phase 1 (tests run). Phase 2 adds failing/updated tests (TDD red).
- **Phase 3 (US1)**: Depends on Phase 2. Implementation makes handler/construct A2A-only; Lambda tests pass.
- **Phase 4 (US2)**: Depends on Phase 3. Remove legacy constructs; CDK tests from Phase 2 pass.
- **Phase 5 (US3)**: Depends on Phase 4. Remove all USE_AGENTCORE and legacy references.
- **Phase 6 (US4)**: Depends on Phase 5. Validate with AWS MCP.
- **Phase 7**: Depends on Phase 6. Final docs and test pass.

### User Story Order

- **US1 (P1)**: First — single path in handler and construct.
- **US2 (P2)**: Second — remove legacy resources from CDK.
- **US3 (P2)**: Third — remove feature flag everywhere.
- **US4 (P3)**: Fourth — AWS MCP validation.

### Parallel Opportunities

- T003, T004, T005, T006 can run in parallel (Phase 2).
- T014–T019 (deletes) can run in parallel after T011–T013.
- T021, T022; T024, T025, T026; T033, T037 can be parallelized where files differ.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 → Phase 2 (tests in place / updated).
2. Phase 3 (US1): A2A-only handler and construct; remove legacy client and legacy tests.
3. **STOP and VALIDATE**: Slack flow uses only A2A; no USE_AGENTCORE in handler/construct.

### Incremental Delivery

1. US1 done → MVP (single path).
2. US2 → Legacy infra removed; cost and codebase reduced.
3. US3 → No flag left; simpler maintenance.
4. US4 → Best-practice validation documented and run.
5. Polish → Docs and tests aligned.

### TDD Summary

- Phase 2: Add/update tests that expect no legacy resources and A2A-only behavior (red).
- Phase 3–4: Implement removal and A2A-only path so those tests pass (green).
- Phase 5–7: Remove remaining references and validate (refactor/document).

---

## Notes

- Each task includes a concrete file path or scope.
- [P] = safe to run in parallel with other [P] tasks in same phase.
- [USn] = task belongs to User Story n for traceability.
- After each phase checkpoint, run the Independent Test for that story.
- Spec SC-005: all existing unit tests pass after migration; update or remove tests that referenced legacy components.
