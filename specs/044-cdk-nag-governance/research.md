# Research: CDK Security, Governance Standards, and Cost Tagging

## US1 — Coding Standards for CLAUDE.md and Constitution

### Finding 1: Existing Python logging infrastructure

**Decision**: Use the existing `logger_util.py` pattern as the normative standard for CLAUDE.md.

**Rationale**: Both `verification-zones/verification-agent/src/logger_util.py` and all `execution-zones/*/src/logger_util.py` already implement structured JSON logging via Python's `logging` stdlib. The pattern is: `log(logger, level, event_type, data_dict)` → emits one JSON line per call. This is already consistent across all agents.

**Standard pattern** (from codebase):
```python
# Correct — structured, includes correlation_id
log(_logger, "info", "request.received", {
    "correlation_id": correlation_id,
    "channel": channel,
})

# Incorrect — raw print, unstructured
print(f"Received request for channel {channel}")
```

**Required fields per level**:
- `INFO`: `event_type`, any context fields relevant to the event
- `WARNING`: `event_type`, `error` (str), optionally `error_type` (class name)
- `ERROR`: `event_type`, `error` (str), `error_type` (class name), `correlation_id`

**Alternatives considered**: structlog (more features, extra dependency), AWS Lambda Powertools (not suitable for non-Lambda FastAPI containers). stdlib logging via `logger_util.py` is the right choice for this project.

---

### Finding 2: Error handling existing conventions

**Decision**: Codify the existing Principle IV pattern from the constitution as a CLAUDE.md rule with examples.

**Current state**: Constitution Principle IV describes fail-open vs fail-closed semantics. Code follows this but without a concrete example in CLAUDE.md.

**Concrete rule**:
```python
# Security pipeline — fail CLOSED
try:
    result = check_whitelist(channel)
except Exception as exc:
    log(_logger, "error", "whitelist.check_failed", {
        "correlation_id": correlation_id,
        "error": str(exc),
        "error_type": type(exc).__name__,
    })
    return error_response("Internal error", correlation_id)  # Never continue

# Infrastructure — fail OPEN
try:
    save_usage_history(data)
except Exception as exc:
    log(_logger, "warning", "usage_history.save_failed", {
        "correlation_id": correlation_id,
        "error": str(exc),
        "error_type": type(exc).__name__,
    })
    # Continue — storage failure is not user-blocking
```

---

### Finding 3: Spec number contamination scope

**Decision**: Add a constitution rule prohibiting spec numbers, branch names, and task IDs in code; scan and clean all existing violations.

**Violations found in codebase** (via grep):
- `verification-zones/verification-agent/cdk/lib/constructs/slack-event-handler.ts`: `// 026 US1 (T007):`
- `verification-zones/verification-agent/src/router.py`: docstring `.. deprecated:: 036-iterative-reasoning`
- Possibly others — full grep required during implementation

**Pattern to prohibit** (with examples):
- `(027)`, `(014)` — spec number in parentheses ✗
- `// 026 US1 (T007)` — spec/task reference in comment ✗
- `.. deprecated:: 036-iterative-reasoning` — branch name in docstring ✗
- `Test020A2ARouting` — spec number in class name ✗
- `041-s3-replication-archive` — branch name in any identifier ✗

**Permitted**: HTTP status codes `(429)`, byte sizes, numeric literals in tests.

---

## US2 — CDK Security Scanning (cdk-nag)

### Finding 4: cdk-nag package and integration

**Decision**: Add `cdk-nag` npm package to `platform/tooling/package.json` and export an `applyNagPack` utility that each zone's `bin/cdk.ts` calls.

**Package**: `cdk-nag` — AWS Solutions Library, maintained by AWS. Implements the `AwsSolutionsChecks` NagPack which covers 150+ rules for IAM, S3, Lambda, DynamoDB, CloudWatch, API Gateway, WAF, etc.

**Integration pattern** (in `bin/cdk.ts` of each CDK zone):
```typescript
import * as cdk from "aws-cdk-lib";
import { AwsSolutionsChecks, NagSuppressions } from "cdk-nag";

const app = new cdk.App();
const stack = new MyStack(app, "MyStack", {...});

// Apply nag AFTER stack creation, BEFORE app.synth()
cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
```

**Failure behavior**: cdk-nag raises CDK errors (via `Annotations.addError`) which cause `cdk synth` to exit non-zero — satisfying FR-007.

**Centralization strategy**: Export `applyNagPacks(app: cdk.App): void` from `platform/tooling` to avoid duplicating the import in 6 zone `bin/cdk.ts` files.

---

### Finding 5: Known cdk-nag rule violations requiring suppression

After reviewing all IAM policies across all 6 CDK stacks:

| Rule | Resource | Justification | Can Narrow? |
|------|----------|---------------|-------------|
| `AwsSolutions-IAM5` | `ecr:GetAuthorizationToken` on `*` | AWS ECR SDK requires `*`; API does not accept per-repo ARNs | No — AWS service constraint |
| `AwsSolutions-IAM5` | `xray:*` on `*` | X-Ray SDK requires `*`; API does not accept resource-scoped ARNs | No — AWS service constraint |
| `AwsSolutions-IAM5` | `cloudwatch:PutMetricData` on `*` | CloudWatch metrics API requires `*` but namespace condition narrows effective scope | No — AWS service constraint (condition present) |
| `AwsSolutions-IAM5` | `bedrock:InvokeModel` on `*` | **CAN be narrowed** to specific model ARN pattern | **Yes** — improvement required |
| `AwsSolutions-S1` | S3 buckets without server access logging | Internal file-exchange buckets; access logging would create circular dependency | Acceptable — suppress with justification |
| `AwsSolutions-SMG4` | Secrets Manager without rotation | Slack tokens are rotated manually; auto-rotation not applicable for Slack API tokens | Acceptable — suppress with justification |
| `AwsSolutions-L1` | N/A | All execution zones use container images, not managed runtimes — rule does not apply | N/A |
| `AwsSolutions-DDB3` | DynamoDB tables without PITR | usage-history table: PITR enabled (040). Other tables (dedupe, rate_limit): PITR not required by design — short-lived operational data | Suppress dedupe/rate_limit tables |

**Bedrock model ARN narrowing** (the one real improvement):
```typescript
// Before (wildcard)
resources: ["*"]

// After (scoped to configured model, with fallback pattern)
resources: [
  `arn:aws:bedrock:${stack.region}::foundation-model/*`,
  `arn:aws:bedrock:${stack.region}:${stack.account}:inference-profile/*`,
]
// Note: Cross-region inference profiles use :: (no account), foundation models use ::
```

---

### Finding 6: Jest test pattern for cdk-nag assertions

```typescript
import { Annotations, Match } from "aws-cdk-lib/assertions";

test("stack has no cdk-nag errors", () => {
  const errors = Annotations.fromStack(stack).findError(
    "*",
    Match.stringLikeRegexp(".*")
  );
  expect(errors).toHaveLength(0);
});
```

This test fails if any unsuppressed violation exists, making violations visible in the CI test report.

---

## US3 — IAM Least-Privilege Review

### Finding 7: IAM policy inventory and assessment

**Review of all 6 stacks**:

| Policy | Current State | Assessment |
|--------|--------------|------------|
| ECR GetAuthorizationToken `*` | All execution agents + verification-agent | Required — suppress |
| ECR BatchGetImage/GetDownloadUrlForLayer `*` | Same | Required — suppress |
| CloudWatch Logs on `/aws/bedrock-agentcore/*` | All AgentCore runtimes | Scoped ✅ |
| X-Ray `*` | All AgentCore runtimes | Required — suppress |
| CloudWatch PutMetricData `*` + condition | All runtimes | Required — suppress (condition present) |
| Bedrock InvokeModel `*` | All AgentCore runtimes | **Needs narrowing** → foundation-model/* ARN pattern |
| DynamoDB `grantReadWriteData` | verification-agent | Scoped to table ARN ✅ |
| Secrets Manager on `*/slack/*` ARN | verification-agent | Scoped ✅ |
| AgentCore InvokeAgentRuntime on specific ARN | slack-event-handler | Scoped ✅ |
| S3 bucket operations | file-exchange-bucket, usage-history | Scoped to bucket ARN ✅ |
| SQS SendMessage | N/A | N/A |

**Real improvement**: Narrow `bedrock:InvokeModel` from `*` to foundation-model and inference-profile ARN patterns (still broad but scoped to Bedrock model namespace, not all AWS).

---

## US4 — Cost Allocation Tags

### Finding 8: Current implementation status

**Decision**: Cost allocation tags are already fully implemented. Work needed is: (1) verify `TAGGABLE_CFN_TYPES` covers all billing resource types, (2) add Jest test assertions that verify tags are present.

**Already implemented** (`platform/tooling/src/utils/cost-allocation-tags.ts`):
- `applyCostAllocationTags(stack, { deploymentEnv })` called in all 6 stack constructors ✅
- `CostAllocationTagAspect` backfills L1/L2 resources not reached by `cdk.Tags.of(scope)` ✅
- Tags: `Environment`, `Project`, `ManagedBy`, `StackName` ✅
- Tag values derived from `deploymentEnv` context (not hardcoded) ✅

**Gap**: `TAGGABLE_CFN_TYPES` set covers 9 types. Missing types that may appear in stacks:
- `AWS::CloudWatch::Alarm` — does not support `Tags` property in CloudFormation L1 (uses `cdk.Tags.of()` instead — check if inherited)
- `AWS::Events::Rule` — does support `Tags`; check if present in stacks
- `AWS::Scheduler::Schedule` — supports `Tags`; used in `DynamodbExportJob` construct
- `AWS::WAFv2::WebACL` — supports `Tags`; used in verification-agent
- `AWS::ApiGateway::RestApi` — supports `Tags`; used in verification-agent

**Verification needed**: Run `cdk synth` and grep CloudFormation template for these resource types to confirm tag propagation.

---

## Summary of Work Required

| Area | Status | Work |
|------|--------|------|
| Python logging standard | Rules exist in code, not in docs | Add to CLAUDE.md with examples |
| Error handling standard | Rules in constitution (IV), not in CLAUDE.md | Add to CLAUDE.md with before/after |
| Code comment standard | Not documented | Add to CLAUDE.md |
| No spec IDs in code | Constitution silent | Add to constitution as new principle |
| Spec ID cleanup in .ts files | 2+ violations found | Remove during implementation |
| cdk-nag | Not installed | Add to platform/tooling, apply in all 6 bin/cdk.ts |
| NagSuppressions | None exist | Add for ECR/XRay/CloudWatch/S3/SM violations |
| Bedrock IAM narrowing | Wildcard `*` | Narrow to foundation-model/* ARN pattern |
| Cost tags coverage | Mostly covered | Verify Scheduler/WAF/ApiGW types; add Jest assertions |
| CDK test nag assertions | None exist | Add to all 6 CDK test suites |
