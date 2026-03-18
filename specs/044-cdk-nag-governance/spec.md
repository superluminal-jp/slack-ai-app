# Feature Specification: CDK Security, Governance Standards, and Cost Tagging

**Feature Branch**: `044-cdk-nag-governance`
**Created**: 2026-03-18
**Status**: Draft
**Input**: User description: "* CLAUDE.md と speckit の constitution にログとコメントとエラーハンドリングのベストプラクティスに従った実装を行うように指示を追加 * speckit の constitution に specs の番号やブランチ名をコード内に含めないようにする指示を追加 * AWS NAG を導入 * 最小権限設定の確認 * cdk synth で全ての課金リソースにコスト配分タグがついていることを確認"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Coding Standards in Project Governance Documents (Priority: P1)

A developer joining the project or implementing a new feature reads the project governance documents (CLAUDE.md and the constitution) and finds explicit, actionable standards for logging, error handling, and code comments. They follow these standards during implementation without needing corrections in code review. They also see a clear rule prohibiting spec numbers, branch names, and internal tracking identifiers from appearing in source code.

**Why this priority**: These are foundational governance rules. Every contributor is affected on every task. Without them, the cleanup work required repeatedly will recur indefinitely after every feature cycle. This is a one-time investment that prevents ongoing maintenance debt.

**Independent Test**: Read CLAUDE.md and the constitution. Confirm that a developer who has never seen previous cleanup work would understand exactly what logging pattern to use, how to handle exceptions, when and how to write comments, and that spec identifiers must not appear in code.

**Acceptance Scenarios**:

1. **Given** a developer writes a new Python function, **When** they consult CLAUDE.md, **Then** they find a clear rule describing the required structured logging pattern (required fields, log levels, correlation ID usage) with a concrete before/after example.
2. **Given** a developer introduces a new `except` block, **When** they consult the project standards, **Then** they know whether it should fail open or fail closed, what fields to log, and that silent swallowing of errors is prohibited.
3. **Given** a developer writes a docstring for a new class, **When** they consult the project standards, **Then** they understand that spec numbers, branch names, task IDs, and internal tracking identifiers must not appear in source code, docstrings, or comments — and they understand why.
4. **Given** a reviewer checks a submitted PR, **When** the code is evaluated against the governance documents, **Then** the code conforms to the logging, error handling, and comment standards without requiring any correction comments on those topics.

---

### User Story 2 - Automated CDK Security Scanning (Priority: P2)

A developer runs the CDK synthesis step and receives immediate feedback if any infrastructure construct violates security best practices — before any code is deployed to AWS. Common violations such as over-permissive IAM policies, missing encryption, or public access being enabled are caught automatically at build time, not discovered in a post-deployment security review.

**Why this priority**: Security violations found after deployment are costly to remediate and may require downtime or compliance notifications. Automated checks at build time shift security left and give developers actionable feedback at zero operational cost.

**Independent Test**: Introduce a deliberately over-permissive IAM policy into a CDK stack, run synthesis, and confirm the build fails with a descriptive error identifying the violation and the affected construct. Confirm that all existing stacks pass all checks with no violations after any required remediations.

**Acceptance Scenarios**:

1. **Given** all CDK stacks contain no security violations, **When** `cdk synth` runs, **Then** the synthesis completes with a clean security scan report showing zero violations.
2. **Given** a new construct with a security violation is introduced (for example, a wildcard IAM action), **When** `cdk synth` runs, **Then** the synthesis fails with a clear message identifying the violating construct and the specific rule that was broken.
3. **Given** a suppression is needed for an intentional architectural exception, **When** a developer adds a suppression annotation, **Then** the suppression includes a written justification that is visible in the CDK source code and in the code review diff.
4. **Given** the CDK Jest test suite runs, **When** tests execute, **Then** all existing security scan results are included in test assertions so that regressions are caught automatically without running a full synthesis.

---

### User Story 3 - IAM Least-Privilege Compliance Verification (Priority: P3)

A security reviewer audits all CDK stacks and confirms that every IAM role and policy follows the principle of least privilege — granting only the specific actions and resources required for each Lambda function, agent runtime, and service role, with no wildcard resources or action scopes broader than necessary.

**Why this priority**: IAM misconfiguration is the leading cause of cloud security incidents. The project constitution already requires least privilege as a non-negotiable rule, but without a systematic review it cannot be confirmed. This user story closes that verification gap.

**Independent Test**: Synthesize all CDK stacks and inspect the generated IAM policy statements. Confirm no statement grants wildcard resources for data-plane actions unless a suppression with written justification is present, and that each role's policy boundary matches its actual runtime needs.

**Acceptance Scenarios**:

1. **Given** a CDK stack is synthesized, **When** the IAM policies are inspected, **Then** no policy statement grants wildcard resources (`"Resource": "*"`) for data-plane actions without a documented suppression justification present in the source.
2. **Given** a Lambda function requires DynamoDB access, **When** its IAM role is reviewed, **Then** the policy grants only the specific operations that function performs and scopes the resource to the specific table ARN.
3. **Given** an IAM policy cannot be narrowed further for a technical reason (for example, CloudWatch Logs due to dynamic log group names at deploy time), **When** a suppression is added, **Then** the suppression includes a written explanation of why the broader scope is unavoidable.

---

### User Story 4 - Cost Allocation Tags on All Billing Resources (Priority: P4)

A project owner can view AWS cost reports filtered and grouped by environment because every AWS resource that generates costs is tagged with standard cost allocation metadata at infrastructure build time. The presence of required tags is verifiable at synthesis time, so missing tags are caught before deployment.

**Why this priority**: Without cost allocation tags, monthly AWS bills are opaque and cannot be attributed to specific environments or features. This prevents cost optimization, budget forecasting, and identifying runaway costs in development environments.

**Independent Test**: Synthesize all CDK stacks and inspect the CloudFormation output. Confirm that every resource type capable of generating AWS charges carries the required tags with correct values. Run synthesis with a resource missing tags and confirm the deviation is detectable.

**Acceptance Scenarios**:

1. **Given** any CDK stack is synthesized, **When** the CloudFormation template is inspected, **Then** every billing resource has at minimum `Project`, `Environment`, and `ManagedBy` tags with correct values.
2. **Given** a new construct is added without cost allocation tags, **When** `cdk synth` runs, **Then** the missing tags are detectable — either via build failure or a verifiable inspection step.
3. **Given** the AWS Cost Explorer is configured with the cost allocation tag keys, **When** a project owner filters costs, **Then** they can separate development spend (`Environment=dev`) from production spend (`Environment=prod`).

---

### Edge Cases

- What happens when a security scan rule must be suppressed for a valid architectural reason? A justification comment must accompany every suppression; suppressions without justification are treated as violations.
- What if a resource type does not support tagging in AWS? Document the exception per resource type; do not fail the build for resource types where tagging is unsupported by AWS.
- What if the constitution amendments require updating multiple downstream templates? The sync impact report in the constitution PR must list all affected templates and confirm each is updated in the same PR.
- What if an existing CDK stack has many IAM violations that cannot all be resolved in one PR? Violations may be suppressed with justification as interim workarounds, but each suppression must have a linked rationale.

## Requirements *(mandatory)*

### Functional Requirements

**Governance Standards (US1)**

- **FR-001**: CLAUDE.md MUST include a structured logging standard specifying: required log levels (`DEBUG`, `INFO`, `WARNING`, `ERROR`), mandatory fields at each level (at minimum: `correlation_id`, `event`; plus `error` and `error_type` for WARNING and ERROR), and a rule that raw `print()` calls are prohibited in production code.
- **FR-002**: CLAUDE.md MUST include an error-handling standard specifying: security-pipeline `except` blocks must fail closed (return an error response and never continue), infrastructure `except` blocks must fail open (log a WARNING and continue with a safe fallback), and all exceptions must be logged before or during handling.
- **FR-003**: CLAUDE.md MUST include a code-comment standard specifying: comments explain intent or non-obvious decisions rather than restating what the code does; docstrings describe the purpose and behavior of the unit; inline TODOs are permitted only with a linked tracking reference.
- **FR-004**: The project constitution MUST contain an explicit rule prohibiting spec numbers (e.g., `(027)`, `(014)`), branch names (e.g., `041-s3-replication-archive`), task IDs (e.g., `T014`), and any other internal process-tracking identifiers from appearing in source code, docstrings, inline comments, or test class and function names.
- **FR-005**: The constitution rule in FR-004 MUST include the rationale: such identifiers become meaningless after the spec lifecycle ends and accumulate as cleanup debt requiring periodic removal sprints.

**CDK Security Scanning (US2)**

- **FR-006**: All CDK stacks in the project MUST run automated security policy checks during `cdk synth`.
- **FR-007**: Security check failures MUST cause `cdk synth` to exit with a non-zero status code, blocking downstream CDK commands.
- **FR-008**: Every intentional suppression of a security check MUST include a written justification in the CDK source at the suppression point, visible in code review.
- **FR-009**: The CDK Jest test suite for each stack MUST include assertions that verify the security scan produces no unexpected violations for that stack's constructs.

**IAM Least Privilege (US3)**

- **FR-010**: Every IAM policy in every CDK stack MUST be reviewed; no statement may grant wildcard resources (`"Resource": "*"`) for data-plane actions unless a suppression with written justification is present in the source.
- **FR-011**: Lambda function IAM roles MUST scope resource ARNs to specific DynamoDB tables, S3 buckets or prefixes, and Bedrock model ARNs wherever the target is known at deploy time.
- **FR-012**: Any IAM statement that cannot be narrowed further for a documented technical reason MUST be suppressed with a written justification in the CDK source.

**Cost Allocation Tags (US4)**

- **FR-013**: All CDK stacks MUST apply a standardized set of cost allocation tags (`Project`, `Environment`, `ManagedBy`) to every construct at the stack level so that tags propagate to all child resources automatically.
- **FR-014**: The `Environment` tag value MUST be derived from the deployment environment configuration, not hardcoded, so that `dev` and `prod` deployments produce distinct tag values.
- **FR-015**: A synthesis-time check MUST be present to verify cost allocation tags are applied on billing resources, producing a detectable failure when tags are absent.

### Key Entities

- **Coding Standard**: A named rule in CLAUDE.md or the constitution describing required behavior, a before/after example, and the rationale for the rule.
- **Security Scan Rule**: A check applied during CDK synthesis with an identifier, a description of the violation it detects, and an optional suppression justification when the rule cannot be satisfied.
- **Cost Allocation Tag**: A key-value metadata pair attached to an AWS resource. Standard keys for this project: `Project`, `Environment`, `ManagedBy`.
- **IAM Policy Statement**: A grant of specific actions on specific resources. Must not use wildcard resources for data-plane actions without documented justification.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer reading CLAUDE.md can identify the correct logging pattern, error-handling strategy, and comment policy for any new code they write without consulting external documentation — verifiable by structured code review against the new standards.
- **SC-002**: Zero spec numbers, branch names, or internal tracking identifiers appear in production source code, test code, docstrings, or comments across the entire repository — verifiable by automated search.
- **SC-003**: CDK synthesis for all stacks completes with zero unresolved security scan violations — verifiable by running synthesis and inspecting the exit code and output.
- **SC-004**: Zero IAM policy statements grant wildcard resources for data-plane operations without a written suppression justification — verifiable by inspecting synthesized CloudFormation templates.
- **SC-005**: Every billing resource in every synthesized CDK stack carries `Project`, `Environment`, and `ManagedBy` tags with correct values — verifiable by automated template inspection.
- **SC-006**: Introducing a deliberate security violation into any CDK stack causes synthesis to fail — verifiable by a negative test case in the CDK test suite.

## Assumptions

- "Billing resource" means any AWS resource that generates a charge: Lambda, DynamoDB table, S3 bucket, EventBridge Scheduler, CloudWatch Alarm, Bedrock AgentCore Runtime, API Gateway, WAF WebACL. Resources that do not generate direct charges (IAM roles, SSM parameters, CloudFormation stacks) are excluded.
- The `ManagedBy` tag value is `CDK` for all resources managed by this project's infrastructure code.
- Cost allocation tags applied at the CDK stack level propagate to all child constructs automatically via CDK tag inheritance and do not need to be added per-construct.
- Existing security check violations (if any) discovered during this feature may be suppressed with justification as an interim measure; they are not required to be architecturally resolved in this same PR.
- Constitution version bumps from this feature are MINOR (new principles or material expansion of existing principles) per the version policy.
- The Python logging standard applies to agent Python code. CDK TypeScript infrastructure code is out of scope for the Python logging rule but must still avoid `console.log` in favour of structured CDK logging patterns.
- `cdk-nag` (AWS Solutions Library) is the target security scanning tool; the spec does not mandate it, but it is the assumed implementation approach.
