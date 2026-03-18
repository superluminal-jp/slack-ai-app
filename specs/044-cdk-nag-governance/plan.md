# Implementation Plan: CDK Security, Governance Standards, and Cost Tagging

**Branch**: `044-cdk-nag-governance` | **Date**: 2026-03-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/044-cdk-nag-governance/spec.md`

## Summary

Five related governance improvements: (1) add Python logging, error handling, and comment standards to CLAUDE.md; (2) add a constitution principle prohibiting spec identifiers in source code; (3) integrate `cdk-nag` into all 6 CDK stacks for automated security scanning; (4) narrow Bedrock IAM actions from wildcard to model-scoped ARNs and suppress other required wildcards with justifications; (5) verify cost allocation tag coverage and add Jest test assertions.

**Key finding**: All 6 stacks already call `applyCostAllocationTags` (US4 is largely a verification + test-assertion task, not a greenfield implementation). The major implementation work is `cdk-nag` integration and the CLAUDE.md/constitution governance updates.

## Technical Context

**Language/Version**: Python 3.11 (agent code), TypeScript 5.x (CDK)
**Primary Dependencies**:
- `cdk-nag` (new) — AWS Solutions security NagPack for CDK, applied in `bin/cdk.ts` of all 6 zones
- `@slack-ai-app/cdk-tooling` (existing) — shared CDK utilities; will add `applyNagPacks` export
- `aws-cdk-lib` 2.215.0 (existing), `cdk-nag` ^2.28.0 (new, compatible with CDK v2)
**Storage**: N/A (no new storage changes)
**Testing**: Jest (CDK), pytest (Python) — TDD: nag test assertions written before applying nag; failing test then green after applying pack + suppressions
**Target Platform**: AWS CDK synthesis environment; all deployed zones (6 stacks across execution-zones and verification-zones)
**Project Type**: Multi-zone CDK monorepo with shared `platform/tooling` package
**Performance Goals**: `cdk synth` must complete with no violations; no latency impact (synthesis-time checks only)
**Constraints**: `cdk-nag` errors must cause `cdk synth` to exit non-zero; suppressions require written justification

## Constitution Check

*GATE: Must pass before implementation. Re-check after Phase 1 design.*

- [X] **SDD (I)**: spec in `specs/044-cdk-nag-governance/` exists; Given/When/Then criteria in spec.md
- [X] **TDD (II)**: Test tasks precede implementation tasks; Red→Green→Refactor planned. CDK Jest tests written first (expecting violations → then fixed); CLAUDE.md changes have no automated test but are verified by structured code review.
- [X] **Security-First (III)**: This feature improves security posture; no security pipeline layers weakened
- [X] **Zone Isolation (V)**: No cross-zone imports introduced; changes are in-zone CDK code and shared platform/tooling
- [X] **Doc & Deploy Parity (VI)**: CLAUDE.md, CHANGELOG.md, README.md, and constitution update tasks are in Phase 5

**Violations**: None.

## Project Structure

### Documentation (this feature)

```text
specs/044-cdk-nag-governance/
├── plan.md              ← this file
├── research.md          ← Phase 0 output (complete)
├── quickstart.md        ← Phase 1 output (no new API contracts)
└── tasks.md             ← Phase 2 output (/speckit.tasks)
```

### Source Code — affected files

```text
platform/tooling/
├── package.json                              # add cdk-nag dependency
├── index.ts                                  # export applyNagPacks
└── src/
    ├── utils/
    │   └── cost-allocation-tags.ts           # add missing CFN resource types
    └── nag/
        └── nag-packs.ts                      # NEW: applyNagPacks(app) utility

CLAUDE.md                                     # add Coding Standards section (logging, error handling, comments)

.specify/memory/constitution.md               # add Principle VII: Clean Code Identifiers

execution-zones/file-creator-agent/cdk/
├── bin/cdk.ts                                # apply nag pack
├── lib/constructs/file-creator-agent-runtime.ts  # narrow Bedrock ARN, add NagSuppressions
├── test/file-creator-agent-stack.test.ts     # add nag assertion test
└── package.json                              # add cdk-nag

execution-zones/fetch-url-agent/cdk/
├── bin/cdk.ts
├── lib/constructs/web-fetch-agent-runtime.ts # narrow Bedrock ARN, add NagSuppressions
├── test/web-fetch-agent-stack.test.ts
└── package.json

execution-zones/docs-agent/cdk/
├── bin/cdk.ts
├── lib/constructs/docs-agent-runtime.ts      # narrow Bedrock ARN, add NagSuppressions
├── test/docs-agent-stack.test.ts
└── package.json

execution-zones/time-agent/cdk/
├── bin/cdk.ts
├── lib/constructs/time-agent-runtime.ts      # narrow Bedrock ARN, add NagSuppressions
├── test/time-agent-stack.test.ts
└── package.json

verification-zones/verification-agent/cdk/
├── bin/cdk.ts
├── lib/constructs/verification-agent-runtime.ts  # narrow Bedrock ARN, add NagSuppressions
├── lib/constructs/slack-event-handler.ts     # add NagSuppressions, remove spec number comment
├── lib/constructs/usage-history-bucket.ts    # add NagSuppression (S3 access log)
├── lib/constructs/usage-history-archive-bucket.ts  # add NagSuppression (S3 access log)
├── test/verification-stack.test.ts           # add nag assertion test
└── package.json

verification-zones/slack-search-agent/cdk/
├── bin/cdk.ts
├── lib/constructs/slack-search-agent-runtime.ts  # narrow Bedrock ARN, add NagSuppressions
├── test/slack-search-agent-stack.test.ts
└── package.json

verification-zones/verification-agent/src/router.py  # remove spec branch name from docstring
```

## Phase 0: Research — COMPLETE

See `research.md` for full findings. Key decisions:

1. **cdk-nag centralized via `platform/tooling`**: Export `applyNagPacks(app)` to avoid duplicating the import pattern across 6 `bin/cdk.ts` files.
2. **Bedrock IAM narrowing**: Change `resources: ["*"]` for `bedrock:InvokeModel` to `arn:aws:bedrock:REGION::foundation-model/*` and `arn:aws:bedrock:REGION:ACCOUNT:inference-profile/*` — scoped to Bedrock model namespace.
3. **ECR/XRay/CloudWatch wildcards**: Suppress with written justification (AWS service constraints — cannot be narrowed).
4. **S3 access logging**: Suppress with justification (internal file-exchange buckets; enabling access logging adds cost without audit requirement).
5. **Python logging standard**: Codify existing `logger_util.py` pattern in CLAUDE.md with before/after examples.
6. **Constitution amendment**: Add Principle VII (version bump 1.1.0 → 1.2.0, MINOR change).

## Phase 1: Design

### No new API contracts or data models

This feature modifies governance documents and CDK infrastructure code. There are no new API endpoints, no new data entities, and no new inter-zone contracts.

### IAM Policy Changes

#### Bedrock model ARN narrowing (all 6 runtimes)

```typescript
// Before
actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
resources: ["*"],

// After
actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
resources: [
  `arn:aws:bedrock:${stack.region}::foundation-model/*`,
  `arn:aws:bedrock:${stack.region}:${stack.account}:inference-profile/*`,
],
```

#### Required suppressions (apply via `NagSuppressions.addResourceSuppressions`)

| Rule | SID | Justification |
|------|-----|---------------|
| `AwsSolutions-IAM5` on ECR `*` | `ECRImageAccess` | `ecr:GetAuthorizationToken` must target `*`; AWS SDK does not accept per-repo ARNs |
| `AwsSolutions-IAM5` on XRay `*` | `XRayTracing` | X-Ray sampling APIs require `*`; AWS service design constraint |
| `AwsSolutions-IAM5` on CloudWatch `*` | `CloudWatchMetrics` | `cloudwatch:PutMetricData` requires `*` resource; namespace condition restricts effective scope |
| `AwsSolutions-S1` on S3 | file-exchange-bucket | Internal agent file-exchange bucket; access log destination would require a separate bucket creating circular dependency |
| `AwsSolutions-S1` on S3 | usage-history/archive buckets | Usage history buckets; server access logging not required — object-level audit via CloudTrail S3 events sufficient |
| `AwsSolutions-SMG4` on Secrets | Slack tokens | Slack API tokens do not support programmatic rotation; rotated manually via Slack app settings |

### CLAUDE.md additions

New section: **Python Coding Standards** (under Constitution section):

```markdown
## Python Coding Standards

### Logging

Use `logger_util.log(logger, level, event_type, data_dict)` — never raw `print()`.

**Required fields by level**:
- `INFO`: `event_type` + context fields for the event
- `WARNING`: `event_type`, `error` (str), optionally `error_type`
- `ERROR`: `event_type`, `error` (str), `error_type` (class name), `correlation_id`

```python
# Correct
log(_logger, "info", "request.received", {"correlation_id": cid, "channel": ch})
log(_logger, "error", "whitelist.check_failed", {
    "correlation_id": cid, "error": str(exc), "error_type": type(exc).__name__
})

# Incorrect
print(f"Received {ch}")          # raw print — prohibited
logger.info("request received")  # unstructured — use log() helper
```

### Error Handling

Match fail-open/fail-closed to the pipeline layer:

```python
# Security pipeline — fail CLOSED (return error, never continue)
except Exception as exc:
    log(_logger, "error", "security.check_failed", {
        "correlation_id": cid, "error": str(exc), "error_type": type(exc).__name__
    })
    return error_response(...)

# Infrastructure — fail OPEN (log + continue)
except Exception as exc:
    log(_logger, "warning", "storage.write_failed", {
        "correlation_id": cid, "error": str(exc), "error_type": type(exc).__name__
    })
    # continue — non-blocking
```

Never use bare `except:`. Always log before handling.

### Comments and Docstrings

- Docstrings describe **what** and **why**, not **how** the code works
- Inline comments explain non-obvious decisions or business rules
- No spec numbers (e.g. `(027)`), branch names (e.g. `041-s3-replication-archive`), or task IDs (e.g. `T014`) in any code, docstring, or comment

```python
# Correct
def check_whitelist(channel: str) -> bool:
    """Return True if channel is in the allowed list. Fails open on lookup error."""

# Incorrect — restates the code
def check_whitelist(channel: str) -> bool:
    """(027): Check whitelist table using DynamoDB GetItem and return bool result."""
```
```

### Constitution amendment — Principle VII

```markdown
### VII. Clean Code Identifiers

Source code, docstrings, inline comments, and test names MUST NOT contain
process-tracking identifiers that are specific to the spec-kit workflow.

**Non-negotiable rules**:
- Spec numbers (e.g. `(027)`, `(014)`) MUST NOT appear in code, docstrings, or comments.
- Branch names (e.g. `041-s3-replication-archive`) MUST NOT appear in code or docstrings.
- Task IDs (e.g. `T014`) and user story labels (e.g. `US1`) MUST NOT appear in code.
- Test class and function names MUST describe the behavior under test, not reference spec numbers.

**Rationale**: Spec numbers and branch names become meaningless after the feature
lifecycle ends. Embedding them creates cleanup debt requiring periodic removal
sprints (as evidenced by features 042 and 043). Code must be readable without
external process context.

**Permitted**: HTTP status codes, numeric literals, and business-domain numbers
(e.g., rate limit counts) are not spec numbers and are permitted.
```

### Cost allocation tag verification

Run `cdk synth` on each stack and grep CloudFormation output for `AWS::Scheduler::Schedule`, `AWS::WAFv2::WebACL`, `AWS::ApiGateway::RestApi`. Confirm tags are present. If not, add those types to `TAGGABLE_CFN_TYPES` in `cost-allocation-tags.ts`.

## Complexity Tracking

No Constitution violations. No exceptional complexity.

## Implementation Notes

### cdk-nag: apply as CDK Aspect, not in stack constructor

```typescript
// In bin/cdk.ts — AFTER stack creation, BEFORE any cdk.App usage
import { applyNagPacks } from "@slack-ai-app/cdk-tooling";

const app = new cdk.App();
const stack = new MyZoneStack(app, "MyZoneStack", { ... });
applyNagPacks(app);  // must be called on app, not stack
```

### NagSuppressions: per-resource, not per-stack

Prefer `NagSuppressions.addResourceSuppressions(construct, [...])` over stack-level suppressions. Stack-level suppressions hide violations in future constructs.

### TDD approach for CDK nag tests

1. Write test asserting zero nag errors (will FAIL — nag not yet applied)
2. Apply nag pack in `bin/cdk.ts` → test now shows violations instead of "nag not installed"
3. Add suppressions for each violation with justification
4. Test goes GREEN

### Spec identifier cleanup in existing .ts and .py files

Grep command to find remaining violations:
```bash
grep -rn "0[0-9][0-9][[:space:]]\|0[0-9][0-9]:\|([0-9][0-9][0-9])\|US[0-9]\|T[0-9][0-9][0-9]\b\|[0-9][0-9][0-9]-[a-z]" \
  execution-zones/ verification-zones/ --include="*.py" --include="*.ts" \
  | grep -v ".d.ts" | grep -v "node_modules" | grep -v "cdk.out" \
  | grep -v "429\|200\|201\|400\|401\|403\|404\|500"
```

Known violations to fix:
- `verification-zones/verification-agent/cdk/lib/constructs/slack-event-handler.ts`: `// 026 US1 (T007):`
- `verification-zones/verification-agent/src/router.py`: `.. deprecated:: 036-iterative-reasoning`
