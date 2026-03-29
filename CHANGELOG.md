# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **apply-resource-policy.py with newer boto3/botocore**: Some releases wrap `bedrock-agentcore-control` in a delegate that omits `put_resource_policy` or binds `_make_api_call` to a stale service model without `PutResourcePolicy`. The script unwraps `_client` first, then calls `put_resource_policy` or `_make_api_call` only when `PutResourcePolicy` exists on that client’s model. If boto3 still cannot call the API (`AttributeError` / `OperationNotFoundError`), it **falls back to `aws bedrock-agentcore-control put-resource-policy`** (AWS CLI v2) so deploy succeeds without upgrading Python dependencies.

- **Agent `Dockerfile` missing from repository**: All six agent `src/Dockerfile` files (execution zones + Slack Search + Verification) were never committed because many environments use a global gitignore pattern for `Dockerfile`. They are now force-added and tracked so fresh clones include the CDK Docker build context.
- **Docker build context path for agent ECR assets**: Added `resolveZoneSrcDir()` in `@slack-ai-app/cdk-tooling` and wired all zone `*AgentEcr` constructs to use it. Resolves `<zone>/src` from `cdk/lib/constructs` via `path.resolve`, with a fallback when `process.cwd()` is the zone `cdk/` directory (so synth/deploy still find `Dockerfile` if `__dirname` is unexpected). Clear error if `src/Dockerfile` is missing (e.g. sparse clone).
- **Workspace `npx cdk` invoked wrong CDK app (Dockerfile / path errors)**: Each zone `cdk/package.json` registered `"bin": { "cdk": "bin/cdk.js" }`, so npm workspaces hoisted one zone app (verification) to `node_modules/.bin/cdk` and **ignored** each directory’s `cdk.json` `app` entry. Running `npx cdk` from an execution zone could synthesize the verification stack and fail asset paths (e.g. missing `file-creator-agent/src/Dockerfile`). Removed the `bin` field from all zone CDK packages so `node_modules/.bin/cdk` resolves to the **aws-cdk** CLI. After upgrading, run `npm install` at the repo root (if `.bin/cdk` still points at a zone app, remove `node_modules/.bin/cdk` once and run `npm install` again).

### Added

- **CDK config templates for execution-style stacks**: Added `cdk.config.json.example` under each execution agent CDK app (`file-creator-agent`, `docs-agent`, `time-agent`, `fetch-url-agent`) and `verification-zones/slack-search-agent/cdk`, so new clones can copy a tracked template before editing gitignored `cdk.config.{env}.json`. Config loaders now point missing-file errors at the same template name consistently.

### Changed

- **Verification zone S3 bucket names** (`056-verification-s3-bucket-account-suffix`): File-exchange, usage-history, and usage-history-archive buckets now use `{stack}-{accountId}-{suffix}` so names stay unique across AWS accounts when reusing the same stack name. Existing stacks that used the old names will create new buckets on deploy; old buckets must be emptied and removed or imported separately.

- **Developer quickstart**: Corrected execution-zone JSON field names (they differ per agent), documented the copy-from-example workflow, added a mandatory Docker preflight (`docker info`, `linux/arm64` smoke test) before deploy/synth, and added troubleshooting for Docker daemon and container-image build failures.
- **Agent registry storage migrated from S3 to DynamoDB** (`055-dynamodb-agent-registry`): Replaced S3 per-agent JSON files with a single DynamoDB table (`{stack}-agent-registry`, PK=`env`, SK=`agent_id`). VerificationAgent reads all agent cards via a single DynamoDB Query instead of ListObjectsV2 + N x GetObject. Deploy scripts write agent cards via `aws dynamodb put-item` instead of `aws s3 cp`. Unifies storage with the existing 5 DynamoDB tables (dedupe, whitelist, rate_limit, existence_check_cache, usage-history) for consistent operations, monitoring, and IAM. Removed `AGENT_REGISTRY_BUCKET`/`AGENT_REGISTRY_KEY_PREFIX` env vars; replaced with `AGENT_REGISTRY_TABLE`/`AGENT_REGISTRY_ENV`. Deleted S3 agent-registry bucket construct.

- **Agent registry migrated from runtime discovery to S3 per-agent files** (`054-ssm-agent-registry`): VerificationAgent now reads agent cards from S3 (`{env}/agent-registry/{agent-id}.json`) at startup instead of invoking `invoke_agent_runtime` on each execution agent. Each agent's deploy script writes its own JSON file to S3 after CDK deploy. Eliminates cascade startup of 4+ execution agents during AgentCore's periodic container restarts, reducing unnecessary vCPU/memory billing. SlackSearch agent unified into the same registry (no longer uses separate `SLACK_SEARCH_AGENT_ARN` env var). CDK creates a dedicated `agent-registry` S3 bucket with versioning, encryption, and enforce-SSL.

### Removed

- **Legacy verification-agent directory deleted** (`053-remove-legacy-code`): Removed the entire `verification-zones/verification-agent/agent/verification-agent/` directory tree (~33 files) that was superseded by the `src/` + `tests/` layout. This tree contained stale copies of modules (e.g. `pipeline.py` still using the old `route_request` path) and was not referenced by Docker builds, CDK, or deploy scripts.
- **Unused API Gateway client removed** (`053-remove-legacy-code`): Deleted `api_gateway_client.py` and `test_api_gateway_client.py` from `slack-event-handler/`. The module implemented SigV4-authenticated calls to the old Execution API Gateway, which was replaced by A2A via Bedrock AgentCore. `handler.py` did not import it.
- **Deprecated router.py removed** (`053-remove-legacy-code`): Deleted `verification-zones/verification-agent/src/router.py` and its test. The module was marked deprecated (routing moved to `orchestrator.py`) and had zero production code references — only `test_router.py` imported it.

### Fixed

- **AgentCore runtime structured logs now reach CloudWatch** (`052-fix-agentcore-logging`): Two-phase fix. Phase 1: removed `logger.propagate = False` from all deployed runtime logger utilities so named loggers propagate to the root logger. Phase 2: added `ENV OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED=true` to all 6 agent Dockerfiles — per [AWS ADOT docs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-OTLP-UsingADOT.html), `opentelemetry-instrument` does NOT auto-install the Python logging bridge without this flag. Also corrected Dockerfile comment (AgentCore does not capture raw container stdout). Added per-agent `tests/test_logger_util.py` suites to validate propagation, stdout compatibility, root-handler delivery, and no duplicate stdout emission.

- **Verification Agent Strands orchestration always returning error** (`fix/bedrock-converse-iam`): Added `bedrock:Converse` and `bedrock:ConverseStream` to the Verification Agent execution role IAM policy. Strands `BedrockModel` uses the `bedrock-runtime` Converse API exclusively — not `bedrock:InvokeModel`. Every call to `self._agent(prompt)` was silently failing with `AccessDeniedException`, causing the orchestration loop to return "エラーが発生しました。しばらくしてからお試しください。" for all Slack requests.

- **Bedrock IAM parity across execution and verification agent runtimes** (`fix/bedrock-converse-iam`): Applied the same `bedrock:Converse` / `bedrock:ConverseStream` actions, `BedrockModelAccess` policy sid, and Japan foundation-model ARNs (`ap-northeast-1`, `ap-northeast-3`) to all execution-agent and slack-search-agent CDK runtime constructs so Strands/Bedrock calls succeed when using JP inference profiles.

### Changed

- **OpenTelemetry duplicate-configurator startup warning** (`051-investigate-agentcore-idle-costs`): All AgentCore agent Dockerfiles now run `pip uninstall -y opentelemetry-distro` after installing requirements. `aws-opentelemetry-distro` pulls in `opentelemetry-distro`, which registers a second `opentelemetry_configurator` entry point; `opentelemetry-instrument` then logged `Configuration of configurator not loaded, aws_configurator already loaded` on every cold start. Removing the stock distro package leaves only the AWS configurator while keeping ADOT instrumentation.

- **Verification Agent lifecycle and agent card discovery** (`051-investigate-agentcore-idle-costs`): Raised Verification Agent Runtime `idleRuntimeSessionTimeout` from 300 seconds to **900 seconds (15 minutes)** to align with AgentCore defaults and reduce session churn. Set `ENABLE_AGENT_CARD_DISCOVERY` to **false** so startup no longer calls `InvokeAgentRuntime` on each execution agent for JSON-RPC `get_agent_card`. Updated `build_agent_tools` to treat **missing cards (`None`) as empty metadata** so orchestration tools are still registered when discovery is off.

### Investigated

- **AgentCore idle billing investigation** (`051-investigate-agentcore-idle-costs`): Investigated why AgentCore runtime sessions and Memory/vCPU costs appeared for Dev agents that had never been directly invoked. **Root cause:** AgentCore creates one billable session per deployment during READY-state provisioning — the container boots (~17–33s), passes an internal health check, then idles for `idleRuntimeSessionTimeoutSeconds` (300s) before stopping, costing ~$0.01/agent/deploy. The ~70 sessions shown in the console for `SlackAI_WebFetchAgent_Dev` are a console display artifact: AgentCore aggregates sessions by agent name across all runtime IDs, so the old runtime (`sf3Gd1FEcZ`, 5.3 MB CloudWatch logs from direct development invocations) appears alongside the new runtime (`2uMLK92WqA`, 0 bytes, 1 provisioning session). Confirmed: `SlackAI_VerificationAgent_Dev` shows 0 sessions, ruling out any Verification Agent cascade as a cause in the Dev environment. `ENABLE_AGENT_CARD_DISCOVERY=false` (already set in CDK) prevents discovery-triggered sessions in environments where the Verification Agent is active (e.g. Prod). The $10–16/day cost spike since 2026-03-15 stems from Prod agents serving real Slack traffic. No further code changes required. See `specs/051-investigate-agentcore-idle-costs/research.md` for full analysis.

### Added

- **Whitelist team and user labels** (`048-whitelist-entity-labels`): Administrators can now attach optional human-readable labels to whitelist `team_id` and `user_id` entries, symmetric with the existing `channel_id` label support. Labels are parsed from all three configuration sources: DynamoDB (`label` sparse attribute on `team_id`/`user_id` items), AWS Secrets Manager (object format `{"id": "T001", "label": "My Workspace"}` mixed with plain strings in `team_ids`/`user_ids` arrays), and environment variables (`ID:label` colon-delimited format in `WHITELIST_TEAM_IDS`/`WHITELIST_USER_IDS`). The `AuthorizationResult` dataclass gains optional `team_label` and `user_label` fields; authorization success and failure log events include the labels when set. Labels never affect authorization decisions.

- **Whitelist channel labels** (`047-whitelist-label`): Administrators can now attach an optional human-readable label (e.g. `#general`) to each channel ID in the whitelist configuration. Labels are stored alongside IDs but never affect authorization — only the ID is used for access control. Supported in all four configuration sources: DynamoDB (`label` attribute on `channel_id` items), AWS Secrets Manager (object format `{"id": "C001", "label": "#general"}`), CDK config files (mixed array of plain strings and `{"id", "label"}` objects), and environment variables (`ID:label` comma-separated format). The `AuthorizationResult` dataclass gains an optional `channel_label` field; success/failure log events include the label when set. CDK `ChannelIdEntry` type (`string | { id, label }`) added to `cdk-config.ts`, `stack-config.ts`, and `slack-event-handler.ts`; Lambda env vars receive IDs only (labels stripped in CDK layer).

### Changed

- **Per-agent deploy scripts and orchestrator delegation** (`050-per-agent-deploy-scripts`): Each agent zone now has a self-contained `scripts/deploy.sh` that auto-installs zone-local CDK `node_modules`, passes `--force` and `--require-approval never` to every `cdk deploy` call, and accepts a `--force-rebuild` flag to trigger image rebuilds. The root `scripts/deploy.sh` orchestrator now delegates all CDK invocations to these per-agent scripts instead of calling CDK directly, removing a class of wrong-CDK-app bugs caused by missing zone-local `node_modules`. The verification agent script accepts `EXECUTION_AGENT_ARNS_JSON` and `SLACK_SEARCH_AGENT_ARN` environment variables so both the orchestrator and standalone callers can pass runtime ARNs. ARN handoff uses CloudFormation outputs (`get_stack_output`) as the authoritative source. `scripts/README.md` documents the per-agent standalone usage.

- **deploy.sh error handling and hardening** (`049-deploy-script-hardening`): Strengthened `cmd_status` by running all five CloudFormation `describe-stacks` calls in parallel (background jobs + `wait`), reducing sequential latency. Fixed `trap`/`mktemp` ordering in `cmd_deploy` so the EXIT trap fires even on early errors. Removed `export SLACK_BOT_TOKEN` and `export SLACK_SIGNING_SECRET` to prevent secret leakage into child processes. Extracted repeated jq ARN JSON assembly into a single `build_execution_agent_arns_json()` helper, eliminating three duplicate blocks. Unified ARN validity checks to `[[ -n "${var}" && "${var}" != "None" ]]` pattern. Updated `help` output to accurately describe the `all` subcommand as always force-rebuilding images.

### Fixed

- **apply-resource-policy.py ClientError handling** (`049-deploy-script-hardening`): `apply_policy()` now catches `botocore.exceptions.ClientError`, prints the AWS error code and message to stderr, and exits with code 2 instead of crashing silently. Moved `import boto3` and `from botocore.exceptions import ClientError` to module top level. Fixed `region=""` passing empty string to `boto3.Session`; now correctly converts empty string to `None`.

### Changed

- **PyPDF2 → pypdf migration** (`046-pypdf-migration`): Replaced the deprecated `PyPDF2~=3.0.0` with actively maintained successor `pypdf~=5.0.0` in `file-creator-agent`. Updated `document_extractor.py` import and API call (`pypdf.PdfReader`). Added unit tests for `extract_text_from_pdf`. No behavioral change.

- **Developer docs updated to match current codebase** (`045-update-docs-and-prompts`): Updated `docs/developer/architecture.md` to reflect the 4-agent execution zone split (file-creator-agent, time-agent, docs-agent, fetch-url-agent), slack-search-agent in verification zone, 6 DynamoDB tables, usage-history S3 + SRR, PITR export, and cdk-nag governance. Updated `docs/developer/quickstart.md` with correct agent names, Slack Search Agent stack output, and current resource list. Rewrote `docs/developer/execution-agent-system-prompt.md` with accurate canonical-file table for all 5 agents.
- **docs-agent system prompt improved** (`045-update-docs-and-prompts`): Added source citation instruction, storage-related search categories (DynamoDB, S3, PITR, replication), and expanded recommended keywords (slack-search-agent, cdk-nag, usage-history, Existence Check).

### Added

- **CDK security scanning (cdk-nag)**: AWS Solutions `cdk-nag` checks are applied across all 6 CDK apps (execution zones + verification zones) during both synthesis (`bin/cdk.ts`) and Jest tests (nag assertion test). Violations fail `cdk synth` / `npm test` unless explicitly suppressed with justification.

### Changed

- **Bedrock IAM least privilege**: Narrowed `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` from `Resource: "*"` to the Bedrock model namespace (`foundation-model/*` and `inference-profile/*`) across all runtimes.
- **cdk-nag suppressions with justifications**: Added targeted `NagSuppressions` for AWS service constraints (ECR auth token, X-Ray sampling APIs, CloudWatch PutMetricData, Secrets Manager rotation for Slack tokens, S3 access logging trade-offs, etc.).
- **Governance docs**: Codified Python logging/error-handling/comment standards in `CLAUDE.md` and added a constitution principle prohibiting process-tracking identifiers (spec numbers/branch names/task IDs) in code and tests.

- **verification-agent CDK artifacts committed** (`041-s3-replication-archive` / `040-dynamodb-pitr-export` / `039-usage-history`): Committed remaining CDK compiled output (`.js`, `.d.ts`) and TypeScript source for constructs added across features 039–041 (`UsageHistoryTable`, `UsageHistoryBucket`, `DynamodbExportJob`, `UsageHistoryArchiveBucket`, `UsageHistoryReplication`) along with corresponding spec artifacts. No behavioral changes beyond what was already documented per feature.

- **Code cleanup in execution-zones** (`043-exec-cleanup`): Removed spec-number annotations (e.g. `(027)`, `(035)`, `(014)`, `(021)`) from all comments and docstrings across `execution-zones/` (file-creator-agent, fetch-url-agent, docs-agent, time-agent); removed unused imports identified by ruff F401; removed dead variable assignments (F841); fixed f-string without placeholder (F541 in `generate_chart_image.py`); renamed spec-numbered test classes (`Test020A2ARouting` → `TestA2ARouting`, `Test021FastAPIDirectRouting` → `TestFastAPIDirectRouting`, `Test032JsonRpcZoneConnection` → `TestJsonRpcZoneConnection`) to intent-based names. Zero behavioral changes.

- **Code cleanup in verification-zones** (`042-code-cleanup`): Removed spec-number annotations (e.g. `(016)`, `(039)`) from all comments and docstrings across `verification-zones/`; migrated raw `print()` calls in Lambda handler files (`event_dedupe.py`, `slack_verifier.py`, `token_storage.py`) to structured `logger.py` calls; removed unused imports identified by ruff F401 across `src/` and `cdk/lib/lambda/`; deleted orphan `bedrock_client.py` (zero callers); updated stale test patches from removed `invoke_execution_agent` to current `run_orchestration_loop`.

### Fixed

- **Missing `log_warn` import in `slack-response-handler/handler.py`**: `log_warn` was called in four reaction-update code paths but never imported from `logger`, causing a `NameError` at runtime. Added `log_warn` to the `from logger import (...)` block.

### Added

- **S3 Same-Region Replication for usage-history archive** (`041-s3-replication-archive`): All objects written to `{stack}-usage-history` (`content/`, `attachments/`, `dynamodb-exports/` prefixes) are automatically replicated to a new independent `{stack}-usage-history-archive` bucket. Delete markers are not replicated — the archive is deletion-independent. Objects expire after 90 days (same as primary); noncurrent versions after 7 days. Cross-account replication is enabled by setting `archiveAccountId` in config or `ARCHIVE_ACCOUNT_ID` env var (zero code changes). New CDK constructs: `UsageHistoryArchiveBucket`, `UsageHistoryReplication`. Versioning enabled on primary bucket as replication prerequisite.

- **DynamoDB usage-history PITR and daily S3 export** (`040-dynamodb-pitr-export`): PITR enabled on the `{stack}-usage-history` DynamoDB table. An EventBridge Scheduler triggers a Lambda daily at JST 00:00 (UTC 15:00) to export the full table to `dynamodb-exports/{YYYY/MM/DD}/` in the usage-history S3 bucket using the native `ExportTableToPointInTime` API. Exports are retained for 90 days via an S3 lifecycle rule. A CloudWatch Alarm (`{stack}-dynamodb-export-job-failure`) fires on Lambda errors. The Lambda is fail-open and never affects user responses.

- **Verification Agent usage history** (`039-usage-history`): Every request processed by the verification agent is now automatically recorded. Request metadata (channel, user, pipeline results, duration) is stored in a new DynamoDB table `{stack}-usage-history`; input/output text and Slack file attachments are stored in a dedicated S3 bucket `{stack}-usage-history` under `content/` and `attachments/` prefixes with 90-day retention for confidentiality. Write failure is fail-open — storage errors are logged as WARNING and never block the user response. Records are queryable by `correlation_id` via a DynamoDB GSI (`correlation_id-index`). Env vars `USAGE_HISTORY_TABLE_NAME` and `USAGE_HISTORY_BUCKET_NAME` are injected at deploy time.

- **Slack Search Agent** (`038-slack-search-agent`): New standalone `verification-zones/slack-search-agent/` zone deploying a Bedrock AgentCore Runtime. Exposes three tools — `search_messages`, `get_thread`, `get_channel_history` — over A2A. Channel access is restricted to the calling channel and public channels; private channels other than the calling channel are denied. CDK stack: `SlackSearchAgentStack`.
- **`SlackSearchClient` and `slack_search` Strands tool** (`verification-agent`, `038-slack-search-agent`): `src/slack_search_client.py` calls the Slack Search Agent via A2A; `src/slack_search_tool.py` wraps it as a Strands `@tool` registered with the orchestrator. `OrchestrationRequest` gains `channel` and `bot_token` fields. The `slack_search` tool is conditionally added when `SLACK_SEARCH_AGENT_ARN` is set.
- **`slackSearchAgentArn` CDK configuration option** (`verification-agent`, `038-slack-search-agent`): Optional prop wired through `cdk.config.{env}.json` → `CdkConfig` → `VerificationStackProps` → runtime construct → `SLACK_SEARCH_AGENT_ARN` env var.

### Fixed

- **Slack Search Agent timestamp format**: Tools (`get_channel_history`, `get_thread`, `search_messages`) now convert raw Slack Unix timestamps (e.g. `1736759166.000200`) to human-readable JST strings (e.g. `2025年01月13日 17:26:06 JST`) before returning output to the LLM, preventing date misinterpretation in bot responses.
- **`_ts_to_jst` exception handling**: Added `OverflowError` and `TypeError` to the caught exceptions in all three Slack Search Agent tools. Previously, extremely large timestamps or `None` values would raise instead of returning the raw fallback value.
- **5 pre-existing CDK test failures in verification-agent** (`038-slack-search-agent`): Recompiled stale `verification-stack.js` (was missing API Gateway/WAF code); fixed `tsconfig.json` `typeRoots` to include workspace root `node_modules/@types`; replaced `Match.stringLikeRegexp` (fails on `Fn::Join` intrinsic) with `findResources()` existence check for the WAF WebACLAssociation assertion. Result: 35/35 CDK tests pass.

### Changed

- **Renamed `execution-zones/execution-agent/` → `execution-zones/file-creator-agent/`**: Directory name now matches the agent's actual identity (CDK constructs and agent card already used `file-creator-agent`). Updated path references in `CLAUDE.md`, `package.json`, `scripts/deploy/deploy-execution-all.sh`, and `scripts/validate/preflight.sh`.

### Fixed

- **Thread context duplication in LLM prompt** (`verification-agent`): `pipeline.py` was prepending `thread_context` to `user_text` AND passing it as a separate `OrchestrationRequest.thread_context` field. `_build_prompt` then injected it twice — once in `## スレッドコンテキスト` and once embedded in `## ユーザーリクエスト`. Removed the redundant prepend; thread context now reaches the LLM exactly once via the structured `## スレッドコンテキスト` section.
- **Attachment filename missing in orchestrator prompt** (`verification-agent`): `_build_prompt` used `r.get('filename', 'file')` but enriched attachments carry the `'name'` key. All attachment labels in the LLM prompt showed as "file". Fixed to `r.get('name', r.get('filename', 'file'))`.
- **`ToolLoggingHook` status detection for string tool results** (`verification-agent`): `_after_tool` called `.get("status")` on `event.result`, which is a plain string when Strands tools return text. Updated to type-check: dicts use `.get("status") == "error"`; strings check `.startswith("ERROR:")`.

### Fixed

- **Bot replies to message_deleted / message_changed events** (`verification-agent`): `message` events with any non-null `subtype` (e.g. `message_deleted`, `message_changed`, `channel_join`) are now silently ignored. Previously only `bot_message` subtype was filtered, causing the bot to send a "Please send me a message" prompt on every deletion.

### Added

- **Auto-reply to channel messages without mention** (`verification-agent`): The bot now responds to all messages in explicitly configured channels without requiring an `@mention`. Channel IDs are set via `AUTO_REPLY_CHANNEL_IDS` env var (comma-separated); unset means no channels are opted in (conservative default). DMs and `app_mention` events are unaffected. Configured via `autoReplyChannelIds` in `cdk.config.{env}.json`, propagated through `CdkConfig` → `VerificationStackProps` → `SlackEventHandlerProps` → Lambda env. `message.channels` added to Slack App manifest bot events.

- **Test coverage for `file_artifact_store` and `file_artifact` propagation** (`verification-agent`, `036-iterative-reasoning`): Added 5 new tests — 3 in `test_agent_tools.py` verifying that `file_artifact_store` is populated when an execution agent response includes a `file_artifact`, that `None` store causes no error, and that the store is unchanged when no artifact is present; 2 in `test_orchestrator.py` (`TestOrchestrationFileArtifactPropagation`) verifying that `OrchestrationAgent.run()` propagates `file_artifact` from `_file_artifact_store` into `OrchestrationResult.file_artifact`, and returns `None` when no file is generated. Total test count: 204 passed, 13 skipped (before bug-fix commits; final count is 209 passed, 13 skipped).

- **Iterative multi-agent orchestration** (`verification-agent`, `036-iterative-reasoning`): Replaced single-pass routing with a Strands agentic loop. A single user request can now dispatch to multiple specialist agents in parallel, synthesize their results, and iterate across up to `MAX_AGENT_TURNS` turns (default 5) until complete. Partial results are returned with an explanatory note when the turn limit fires. New modules: `src/orchestrator.py` (`OrchestrationAgent`, `run_orchestration_loop`, `OrchestrationRequest`, `OrchestrationResult`, `ToolCallRecord`), `src/hooks.py` (`MaxTurnsHook`, `ToolLoggingHook`), `src/agent_tools.py` (`build_agent_tools`). CDK env var `MAX_AGENT_TURNS` added to the verification-agent container.

### Changed

- **Pipeline routing replaced by orchestration loop** (`verification-agent`): `pipeline.py` now calls `run_orchestration_loop()` instead of `route_request()` + `invoke_execution_agent()`. The router-based single-agent dispatch path (including `list_agents`, `UNROUTED`, per-agent attribution) is superseded. `router.py` is retained for backward-compatible imports but deprecated.

- **Web Fetch Agent** (`fetch-url-agent`): New standalone execution zone that handles URL content retrieval via the `fetch_url` tool. The agent runs as an independent AgentCore Runtime (A2A, port 9000) with SSRF protection, 512 KB download limit, and 14,000-character text truncation. The `fetch_url` tool has been removed from `execution-agent` to maintain single-responsibility per zone. Verification-agent now supports `WEB_FETCH_AGENT_ARN` env var for agent registration.
- **Agent list Slack reply** (`verification-agent`): Users can ask the bot what it can do (e.g., "何ができる？", "agent list") and receive a formatted Slack reply listing all registered agents with their names, descriptions, and skills. The router LLM detects this intent and selects the new `list_agents` special route; the verification agent compiles the reply from the in-memory agent card cache without invoking any execution agent.
- **Platform tooling package** (`@slack-ai-app/cdk-tooling`): Shared npm package at `platform/tooling/` exporting `cdk-logger`, `cdk-error`, `cost-allocation-tags`, `config-loader`, and `log-retention-aspect`. All zones import shared utilities from this package instead of local copies.
- **Standalone execution zone CDK apps**: Each execution agent (`execution-agent`, `time-agent`, `docs-agent`) is now an independent CDK application under `execution-zones/<agent>/cdk/` with its own `bin/`, `lib/`, `test/`, `package.json`, and deploy script.
- **Zone deploy scripts**: `execution-zones/<agent>/scripts/deploy.sh` per zone; `scripts/deploy/deploy-all.sh`, `deploy-execution-all.sh`, `deploy-verification-all.sh`; `scripts/validate/preflight.sh` for pre-deploy checks.
- **npm workspaces root**: Root `package.json` registers `platform/tooling`, `execution-zones/*/cdk`, and `verification-zones/*/cdk` as workspaces so a single `npm install` satisfies all CDK dependencies.

### Changed

- **Execution agent source layout**: Python source and tests for each execution agent moved from `cdk/lib/<type>/agent/<agent>/` to `execution-zones/<agent>/src/` and `execution-zones/<agent>/tests/`.
- **Verification agent source layout**: Python source and tests moved from `verification-zones/verification-agent/agent/verification-agent/` to `verification-zones/verification-agent/src/` and `verification-zones/verification-agent/tests/`.
- **Verification zone CDK imports**: `verification-zones/verification-agent/cdk/` now imports shared utilities from `@slack-ai-app/cdk-tooling` instead of local `lib/utils/` copies.
- **Bedrock model ID**: All agents updated to use `jp.jp.anthropic.claude-sonnet-4-5-20250929-v1:0` (cross-region inference profile for ap-northeast-1).
- **ts-jest configuration**: `isolatedModules` moved from inline Jest transform option to `tsconfig.json` `compilerOptions` per ts-jest v29+ recommendation; eliminates deprecation warning.

### Removed

- **Monolithic `cdk/` directory**: Replaced by independent per-zone CDK apps under `execution-zones/` and updated `verification-zones/`.

### Fixed

- **CDK deploy scripts**: npm workspaces hoists `aws-cdk` to root `node_modules`; deploy scripts now resolve `cdk` CLI from project root with zone-local fallback and `cd` into the zone's CDK directory before invoking `cdk deploy`.
- **ts-node module resolution**: Added `ts-node` block to each zone's `tsconfig.json` overriding `module`/`moduleResolution` to `CommonJS`/`node` at runtime so `cdk synth` resolves TypeScript files correctly under Node.js 24.
- **`platform/tooling` package.json `main` field**: Changed from `index.js` to `index.ts` to eliminate `DEP0128` Node.js warning when resolving the symlinked workspace package.
- **Local import `.js` extensions**: Removed explicit `.js` extensions from intra-zone and `platform/tooling` imports; CommonJS resolution does not require them and ts-node cannot resolve `.js` → `.ts` at runtime without ESM loader.

### Changed

- **Documentation updated for zone-based restructuring**: All Markdown files updated to reflect the current codebase — `README.md` and `README.ja.md` project structure diagrams and Quick Start deploy commands replaced (old `cdk/` monolith → `execution-zones/*/cdk` and `verification-zones/*/cdk`); deploy commands updated from `./scripts/deploy.sh` to `./scripts/deploy/deploy-all.sh`; `docs/developer/quickstart.md` setup steps revised (npm workspaces install from root, zone-specific config files, zone-aware deploy methods); `docs/developer/architecture.md`, `requirements.md`, `troubleshooting.md`, `execution-agent-docs-access.md`, `execution-agent-system-prompt.md`, and `security.md` file-path references corrected; invalid CloudWatch log group paths (`/aws/cdk/lib/…`) fixed to actual Lambda log group names; `verification-zones/verification-agent/README.md` structure and test commands updated to reflect `src/` and `tests/` layout.

- **Verification–Execution zone connection (032)**: Zone-to-zone protocol is now JSON-RPC 2.0 (method `execute_task`). Application layer is transport-agnostic; transport (e.g. InvokeAgentRuntime) remains an implementation detail. Execution Agent accepts JSON-RPC Request and returns JSON-RPC Response; Verification Agent builds Request and parses Response. Error contract unified (e.g. -32602 Invalid params, -32603 Internal error).
- **Deploy script simplification**: Replaced two-phase synth/deploy with single `cdk deploy`, use `--outputs-file` for stack outputs instead of `describe-stacks` polling, deduplicated agent validation loop into `wait_for_agent_ready()`, removed config file mutation during deploy, and extracted inline Python resource policy into standalone `scripts/apply-resource-policy.py`
- **Execution Agent system prompt**: Consolidated split prompts (`FILE_GEN_ONLY_SYSTEM_PROMPT` + `EXTENDED_SYSTEM_PROMPT_ADDON`) into single `FULL_SYSTEM_PROMPT` with all tools explicitly listed
- **CDK outdir**: `cdk/bin/cdk.ts` reads `CDK_OUTDIR` env for cloud assembly output path; explicit `app.synth()` call
- **Force image rebuild**: `execution-agent-ecr.ts` accepts `extraHash` prop; `execution-stack.ts` passes `forceExecutionImageRebuild` context value to change Docker asset hash

### Added

- **Execution Agent `fetch_url` tool**: Fetches and extracts text content from URLs so users can ask the agent to summarize web pages. Includes SSRF prevention (private IP blocking, scheme validation), HTML text extraction via BeautifulSoup, and size/truncation limits.
- **Utility scripts**: `scripts/force-execution-redeploy.sh` (quick single-stack image rebuild), `scripts/check-execution-deploy-status.sh` (runtime status check)

- **Execution Agent**: Single system prompt source (`system_prompt.py`), tools `get_current_time`, `get_business_document_guidelines`, `get_presentation_slide_guidelines`, `search_docs`; docs for system prompt and docs access.
- **Documentation standards**: New [docs/DOCUMENTATION_STANDARDS.md](docs/DOCUMENTATION_STANDARDS.md) defining best practices for all project documentation (when to update, structure, writing style, CHANGELOG format, module README requirements, API docs, quality checklist). CLAUDE.md, docs/README.md, README.md, CONTRIBUTING.md, cdk/README.md, and agent READMEs updated to reference and apply these standards; CLAUDE.md Commands section corrected.

### Removed

- **bedrock-processor Lambda**: Removed `cdk/lib/execution/lambda/bedrock-processor`; execution zone is A2A-only (Verification Agent invokes Execution Agent via AgentCore Runtime).

### Fixed

- **Deploy Phase 2.5 resource policy**: Apply Execution Agent resource policy via Python/boto3 instead of `aws bedrock-agentcore-control put-resource-policy` (older AWS CLI may not support this operation). Script installs boto3 if missing and passes policy parameters via environment for safe quoting.
- **IAM role name collision (Dev/Prod)**: Execution and Verification AgentCore runtime execution roles now use stack name in `roleName`; default AgentCore runtime names include env suffix (e.g. `SlackAI_ExecutionAgent_Prod`, `SlackAI_VerificationAgent_Dev`) so Dev and Prod stacks can coexist in the same account
- **Verification Agent missing `import time`**: Restored `import time` in `authorization.py`, `rate_limiter.py`, `slack_poster.py` — dropped during logging refactor, causing `NameError` on every request and silent failure (no Slack response)
- **Deploy script PutResourcePolicy**: Fixed `Resource: "*"` (must match specific ARN); removed unsupported endpoint policy; fixed empty `AWS_PROFILE` causing `ProfileNotFound`
- **AgentCore Runtime CloudWatch logs**: Replaced `print()` with Python `logging` module. Structured JSON logs are output via `logging.StreamHandler(sys.stdout)` with `%(message)s` formatter for CloudWatch compatibility. Added `logger_util` in both agents for centralized configuration.
- **Best-practices optimization**: Added `correlation_id` to all log entries; fixed silent exception in `_get_slack_file_bytes`; added SSRF prevention and memory guard in Slack Poster S3 fetch; input validation in `build_file_artifact`/`build_file_artifact_s3`; `ensure_ascii=False` for Japanese log output; corrected stale docstrings

### Added

- **CDK Logging, Comments, and Error Handling** (029-cdk-logging-error-handling)
  - Structured CDK logging: `cdk-logger` (level, phase, context) and `cdk-error` (message, cause, remediation, source) per log-event and error-report contracts
  - App entry and stack lifecycle logs in `bin/cdk.ts`; entry-point validation throws `CdkError` with remediation hints
  - `LogRetentionAspect` warns on `CfnLogGroup` without retention; applied at app level
  - Documented-unit JSDoc (Purpose, Responsibilities, Inputs, Outputs) for execution/verification constructs and key types
  - Spec, plan, tasks, contracts (log-event, error-report), and quickstart in `specs/029-cdk-logging-error-handling/`
- **S3-backed Large File Transfer** (028-s3-large-file-transfer)
  - Large file artifacts (> 200 KB) uploaded to S3 `generated_files/` prefix, delivered to Slack Poster via pre-signed URL in SQS message — bypasses SQS 256 KB limit
  - Files <= 200 KB continue inline (contentBase64) for backward compatibility
  - Slack Poster Lambda: dual-mode processing — fetches from S3 presigned URL or decodes inline base64
  - S3 lifecycle: 1-day expiration on `generated_files/` prefix for automatic cleanup
  - CDK: `grantReadWrite` for `generated_files/*` on Verification Agent role; lifecycle rule on FileExchangeBucket
  - SSRF prevention: validates S3 URL scheme (HTTPS) and host (`*.amazonaws.com`) before fetch
  - Memory guard: Lambda limits S3 fetch to 10 MB max
  - Tests: pipeline large/small file routing, S3 upload/presigned URL, Slack Poster S3 fetch
- **Slack File Generation (Best Practices)** (027-slack-file-generation-best-practices)
  - Execution Agent file generation tools: Markdown, CSV, TXT (generate_text_file); Excel, Word, PowerPoint (generate_excel, generate_word, generate_powerpoint); chart images (generate_chart_image)
  - Strands Agent with Bedrock Converse; tools invoked via @tool with Japanese docstrings and inputSchema descriptions
  - File size limits: text 1 MB, Office 10 MB, image 5 MB; sanitize_filename for cross-platform names; size-exceed Japanese user notification
  - Attachment-based conversion: documents and images from 024 flow passed to agent; tools receive context for "CSV → Excel"–style requests
  - Error handling: tool_failure mapped to Japanese message (FR-010); max 1 file per request (FR-008)
  - Best practices verified: HTTPS (boto3 default), minimal IAM (InvokeModel only), BP-FG-001/002/003, BP-S-001/002; checklists/best-practices-verification.md
  - Dependencies: openpyxl, python-docx, python-pptx, matplotlib, Pillow
- **Reaction swap on Slack reply**: When posting AI response to Slack, the system now removes the 👀 (eyes) reaction and adds ✅ (white_check_mark) on the original message, providing clear visual feedback that processing completed successfully
- **Slack File Attachment Support** (024-slack-file-attachment)
  - S3-based secure file transfer: Verification Agent downloads from Slack, uploads to S3, generates pre-signed URLs; Execution Agent downloads via pre-signed URL (no bot token in execution zone)
  - Document Q&A: PDF, DOCX, XLSX, CSV, TXT via native Bedrock document blocks; PPTX via text extraction fallback
  - Image analysis: PNG, JPEG, GIF, WebP via Bedrock image blocks
  - Multiple files: up to 5 files per message; limits 10 MB/image, 5 MB/document
  - User-friendly error messages (FR-013), structured logging with correlation IDs (FR-014)
  - `files:read` Slack scope required for attachment downloads
  - Test counts: Verification Agent 93, Execution Agent 110
- **Echo-Mode-Disabled Verification Pipeline Tests** (022-echo-mode-disable-validation)
  - 20 new TDD tests across 4 test classes in `cdk/lib/verification/agent/verification-agent/tests/test_main.py`, covering the echo-mode-off (normal) execution delegation flow
  - `Test022NormalFlowDelegation` (5 tests): verifies that echo off triggers `invoke_execution_agent`, response contains no echo prefix, file artifacts pass through, payload contains all required fields, and `VALIDATION_ZONE_ECHO_MODE` is treated case-insensitively
  - `Test022SecurityCheckPipeline` (5 tests): verifies pipeline ordering — existence check runs before authorization, authorization runs before rate limit, each exception class returns the correct error response, and all checks passing proceeds to execution delegation
  - `Test022ExecutionErrorPaths` (6 tests): verifies Bedrock throttling, access-denied, invalid JSON, and empty-response cases each post a user-facing friendly message, that internal error details are not leaked to Slack, and that `is_processing` is reset on exception
  - `Test022StructuredLogging` (4 tests): verifies all log entries are valid JSON, correlation ID is present across all log entries, security check results appear in logs, and bot token does not appear in error logs
  - `pipeline.py` enhancements: `JSONDecodeError` handling for malformed execution responses, structured log entry on Base64 decode
  - Verification Agent test count raised from 63 to 83; `pipeline.py` line coverage raised to 94%
- **Strands Migration & Cleanup** (021-strands-migration-cleanup)
  - Migrated Verification Agent and Execution Agent from `bedrock-agentcore` SDK (`BedrockAgentCoreApp`) to **FastAPI + uvicorn** with manual route definitions (POST `/`, GET `/.well-known/agent-card.json`, GET `/ping`)
  - CloudWatch IAM policy fix: `StringLike` condition with correct `SlackAI-*` namespace pattern
  - Echo mode configuration: `validationZoneEchoMode` field in CdkConfig with type-safe boolean handling
  - E2E test suite (`tests/e2e/`) for Slack flow integration testing
  - Dependency version pinning with `~=` (compatible release): `strands-agents[a2a]~=1.25.0`, `fastapi~=0.115.0`, `uvicorn~=0.34.0`, `boto3~=1.34.0`, `slack-sdk~=3.33.0`
  - Test coverage: Verification Agent 63 tests, Execution Agent 79 tests, CDK 25 tests (AgentCore constructs)
- **Async AgentCore Invocation** (016-async-agentcore-invocation)
  - SlackEventHandler returns HTTP 200 immediately after enqueueing an agent invocation request to SQS (`agent-invocation-request`), avoiding Slack 3s timeout and Lambda blocking
  - Agent Invoker Lambda consumes SQS messages and calls `InvokeAgentRuntime` (Verification Agent); long-running agent runs no longer hit SlackEventHandler Lambda timeout (up to 15 min in Agent Invoker)
  - SQS Dead Letter Queue (`agent-invocation-dlq`) with `maxReceiveCount: 3` for failed invocations; batchItemFailures returned on InvokeAgentRuntime exception for SQS retry
  - Verification Zone retains Slack posting responsibility; cross-account communication remains A2A only (SQS is within verification account only)
  - Docs: zone-communication §6.6 (016 flow), troubleshooting section for SQS backlog, Agent Invoker errors, DLQ, InvokeAgentRuntime permission
- **AgentCore A2A Migration — Legacy Removal** (015-agentcore-a2a-migration)
  - Slack-to-AI traffic now uses a single AgentCore A2A path; legacy API Gateway, SQS, BedrockProcessor Lambda, and SlackResponseHandler Lambda removed from CDK
  - SlackEventHandler Lambda invokes Verification Agent only via `bedrock-agentcore` `InvokeAgentRuntime` (no `USE_AGENTCORE` flag or legacy path)
  - Execution Stack: Execution Agent ECR + AgentCore Runtime only; output `ExecutionAgentRuntimeArn`
  - Verification Stack: SlackEventHandler, Verification Agent Runtime, DynamoDB, Secrets; no ExecutionResponseQueue or SlackResponseHandler
  - Config and docs: `useAgentCore`, `executionApiUrl`, `executionResponseQueueUrl`, `verificationLambdaRoleArn` removed; deployment is executionAgentArn-only
  - CDK tests and SlackEventHandler pytest updated for A2A-only; all references to USE_AGENTCORE and legacy components removed from application code and CDK
- **A2A File to Slack** (014-a2a-file-to-slack)
  - Execution Agent can return a generated file artifact (`generated_file`) alongside text (A2A result with `file_artifact`)
  - Verification Agent parses file artifact, uploads to Slack via `post_file_to_slack` (Slack SDK `files_upload_v2` / getUploadURLExternal → completeUploadExternal)
  - Post order: text first, then file in the same thread; on upload failure, post user-facing error message to thread (FR-007)
  - File limits: max 5 MB, allowed MIME types `text/csv`, `application/json`, `text/plain` (configurable via env); size/MIME violations return text-only with user-facing message (FR-005, FR-006)
  - Support for text-only, file-only, and text+file responses (US1, US2, US3)
  - Execution: `file_config.py`, `response_formatter.build_file_artifact` / `validate_file_for_artifact`, Agent Card skill `generated-file`
  - Verification: `parse_file_artifact`, `post_file_to_slack` in `slack_poster.py`, structured logging for file post success/failure
  - Documentation: zone-communication §6.5 (014 file artifact flow), README troubleshooting for `files:write`, quickstart and contracts in `specs/014-a2a-file-to-slack/`
  - Tests: Execution 68 tests, Verification 46 tests (including file artifact and file-posting paths)
- **AgentCore A2A Inter-Zone Communication** (013-agentcore-a2a-zones)
  - Amazon Bedrock AgentCore Runtime with A2A (Agent-to-Agent) protocol
  - Verification Agent container (ARM64 Docker) — security pipeline, Slack posting
  - Execution Agent container (ARM64 Docker) — Bedrock processing, attachment handling
  - A2A client with SigV4 authentication and async task polling (exponential backoff)
  - Agent Card (`/.well-known/agent-card.json`) for A2A-compliant Agent Discovery
  - Health check endpoints (`/ping`) with Healthy / HealthyBusy status
  - CDK L1 constructs: `ExecutionAgentRuntime`, `VerificationAgentRuntime`, ECR image builds
  - Cross-account resource-based policies for `InvokeAgentRuntime` permissions
  - Feature Flag (`USE_AGENTCORE`) for zero-downtime migration and rollback
  - `validate_agentcore` step in deployment script with ACTIVE status polling
  - CloudWatch custom metrics for both agents (A2A tasks, Bedrock errors, security events)
  - Structured JSON logging with correlation_id and PII masking
  - 97 TDD tests (41 Execution Agent + 32 Verification Agent + 24 CDK/Jest)
- **Complete Stack Separation Architecture** (Structure Reorganization)
  - Fully separated stack structure with self-contained directories
  - Each stack (Execution/Verification) contains both CDK code and Lambda code
  - Lambda code moved to `cdk/lib/{execution|verification}/lambda/`
  - CDK code organized under `cdk/lib/{execution|verification}/`
  - Simplified path references (e.g., `../lambda/bedrock-processor` instead of `../../../lambda/execution-stack/bedrock-processor`)
- **Cross-Account Zones Architecture** (010-cross-account-zones)
  - Two independent stacks deployment (VerificationStack + ExecutionStack)
  - Cross-account IAM authentication support
  - Independent lifecycle management for each zone
  - Deployment scripts for 3-phase deploy process
  - Graceful error handling for API unavailability
  - Stack-prefixed DynamoDB table names to avoid resource conflicts
  - API Gateway resource policy configuration for secure inter-zone communication
  - Local bundling support for Colima/Docker compatibility
- Documentation reorganization based on Diátaxis framework (009-docs-reorganization)
- CONTRIBUTING.md with contribution guidelines
- CHANGELOG.md following Keep a Changelog format
- SECURITY.md with security policy
- Migration guide from single-stack to two independent stacks architecture
- Cross-account IAM authentication documentation

### Changed

- Verification Agent and Execution Agent: replaced `bedrock-agentcore` SDK (`BedrockAgentCoreApp`, `_handle_invocation`, `add_async_task`/`complete_async_task`) with FastAPI + uvicorn direct routing
- Agent containers now use raw JSON POST on port 9000 (not JSON-RPC 2.0) for AgentCore `invoke_agent_runtime` compatibility
- README.ja.md, README.md, docs/README.md: 014 A2A file-to-Slack feature and recent updates (2026-02-08)
- docs/reference/operations/slack-setup.md: Added `files:write` scope for 014 file uploads; manifest example updated
- docs/slack-app-manifest.yaml: Added `files:write` to bot scopes for 014
- docs/how-to/troubleshooting.md: New section "ファイルがスレッドに表示されない（014）"; log pattern `slack_post_file_failed`
- Architecture overview (`docs/reference/architecture/overview.md`) now includes AgentCore A2A section
- Zone communication docs (`zone-communication.md`) updated with A2A protocol path
- System architecture diagram (`system-architecture-diagram.md`) includes AgentCore resources
- Deployment script (`deploy-split-stacks.sh`) includes AgentCore validation phase
- CDK config types updated with `executionAgentName`, `verificationAgentName`, `useAgentCore`, `executionAgentArn`
- SlackEventHandler Lambda updated with Feature Flag routing (`USE_AGENTCORE` environment variable)
- README.md and README.ja.md updated with AgentCore A2A architecture documentation
- cdk/README.md updated with AgentCore resources, config fields, and test coverage
- docs/README.md updated with AgentCore documentation links
- Restructured docs/ directory with tutorials/, how-to/, reference/, explanation/ categories
- Simplified README.md to focus on overview and navigation
- Converted docs/README.md to navigation hub
- CDK entry point now defaults to two independent stacks mode (single-stack mode removed)
- Lambda folder structure reorganized: `lambda/verification-stack/` and `lambda/execution-stack/` → moved to `cdk/lib/{execution|verification}/lambda/`
- CDK code structure reorganized: stacks and constructs moved to `cdk/lib/{execution|verification}/` for complete stack isolation
- Project structure now reflects complete stack independence with self-contained directories
- DynamoDB table names now include stack name prefix to prevent conflicts
- IAM policy for VerificationStack Lambda uses wildcard resource (access controlled by API Gateway resource policy)
- Updated deployment documentation with `.env` file support and account ID configuration
- All documentation updated to reflect two independent stacks (VerificationStack + ExecutionStack) as the standard deployment method

### Fixed

- Fixed `IndentationError` in `verification-agent/main.py` line 132 (12 spaces → 8 spaces)
- Fixed `useAgentCore` variable declaration order in `verification-stack.ts` (temporal dead zone)
- Resolved DynamoDB table name conflicts between existing and new stacks
- Fixed CloudFormation Early Validation errors for cross-stack resource references
- Improved error handling for Execution API unavailability

### Removed

- `bedrock-agentcore` SDK dependency — replaced by `fastapi`, `uvicorn`, and `strands-agents[a2a]`
- `BedrockAgentCoreApp` / `_handle_invocation` / `add_async_task` / `complete_async_task` patterns from agent containers
- `SlackBedrockStack` single-stack deployment — removed from codebase. Two independent stacks (VerificationStack + ExecutionStack) are the standard.
- Single-stack deployment mode — removed from `cdk/bin/cdk.ts`. Default is two independent stacks deployment.

## [1.0.0] - 2025-12-27

### Added

- Initial release of Slack Bedrock MVP
- Slack to Amazon Bedrock integration via AWS Lambda
- Two-Key Defense security model (HMAC SHA256 + Slack API verification)
- Thread history retrieval and contextual responses
- Attachment processing (images and documents)
- Whitelist-based authorization (team_id, user_id, channel_id)
- Bedrock Guardrails integration for content safety
- DynamoDB for event deduplication and token caching
- CloudWatch monitoring and alerting
- AWS CDK infrastructure as code

### Security

- Multi-layer authentication (Slack signature + API verification)
- Timestamp validation to prevent replay attacks
- PII detection and masking
- Token limits to prevent abuse
- Encrypted context storage (DynamoDB + KMS)

---

[Unreleased]: https://github.com/owner/slack-ai-app/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/owner/slack-ai-app/releases/tag/v1.0.0
