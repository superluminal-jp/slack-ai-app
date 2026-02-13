# Research: CDK Logging, Comments, and Error Handling (Best Practices)

**Feature**: 029-cdk-logging-error-handling  
**Sources**: AWS IaC MCP (CDK best practices, CDK documentation search), CDK Toolkit Library docs (error handling, messages).

## 1. Structured Logging and Observability

**Decision**: Emit structured, consistent log output at key lifecycle points (app entry, config load, stack/construct creation, synthesis) so operators can trace behavior without reading source. Use a single format (e.g., level, message, optional context object) and avoid dependency on a specific log sink.

**Rationale**: AWS CDK best practices stress "measure everything" and determinism; CDK Toolkit docs recommend storing important messages in logs for troubleshooting and using clear progress indicators. FR-001 and SC-005 require consistent, traceable output. Existing `bin/cdk.ts` already uses `console.warn` for config fallback; standardizing format and adding discrete lifecycle events (e.g., "Config loaded", "Stack X created") improves diagnosability.

**Alternatives considered**:
- Rely only on CDK CLI default output: insufficient for "key phases and decisions" (FR-001) and does not guarantee a consistent, structured format.
- Introduce a heavy logging framework (e.g., Winston) in CDK app: overkill for a single app entry point and may conflict with CLI output; rejected in favor of a light, consistent convention (e.g., `[LEVEL] message` + optional JSON context).

---

## 2. Validation and Error Reporting (Aspects and Annotations)

**Decision**: Use CDK **Aspects** and **Annotations** (`Annotations.of(node).addError(message)` / `addWarning`) for construct-level validation so that synthesis fails with clear, context-rich messages tied to the failing construct. For entry-point validation (e.g., invalid env or config), throw errors with a consistent shape: cause, optional resource/step context, and remediation hint when feasible.

**Rationale**: AWS CDK best practices recommend using Aspects to validate security and compliance (e.g., bucket encryption) and to add errors that block synthesis. CDK Toolkit Library documents structured errors (source, error type, descriptive message) and recommends keeping error handling simple while providing clear messages. FR-004 and FR-007 require actionable errors with context; Annotations surface errors at the right construct and integrate with `cdk synth` output.

**Alternatives considered**:
- Only throw generic `Error` in bin: does not attribute failure to a specific resource (FR-007).
- Rely solely on CloudFormation deployment errors: too late in the pipeline; synthesis-time validation catches misconfiguration earlier.

---

## 3. Secrets and Sensitive Data

**Decision**: Never include secrets, tokens, or sensitive identifiers in log messages or user-facing error output. Validate error paths and log construction so that ARNs, account IDs, or resource names are allowed only where they do not expose secrets; redact or omit any value that might be sensitive.

**Rationale**: FR-005 and SC-004 are explicit. AWS CDK best practices (Secrets Manager, Parameter Store, no hardcoded credentials) and security guidelines align with this. No exception for "debug" mode in production-facing output.

**Alternatives considered**: None; non-negotiable.

---

## 4. Documentation and Comment Style

**Decision**: Adopt a single, consistent style for comments and JSDoc: (1) every top-level stack and construct module has a short purpose and main responsibilities; (2) non-obvious configuration choices, constraints, and dependencies (ordering, naming rules) are documented at the point of use; (3) public APIs (constructs, props, notable methods) have JSDoc with summary and, where relevant, `@param`/`returns`. Prefer JSDoc for discoverability and tooling.

**Rationale**: FR-002, FR-003, FR-006 and SC-002 require that intent and boundaries are clear. CDK best practices recommend making constructs reusable and documenting expected usage. The existing codebase (e.g., `ExecutionStack`) already uses module-level JSDoc; standardizing and extending to all stacks and constructs ensures predictability (SC-005).

**Alternatives considered**:
- External docs only: does not satisfy "in-code documentation" and "predict where to look" (FR-006, SC-005).
- Inline comments only without JSDoc: weaker for public API and tooling (IDE, doc generators).

---

## 5. Wrapping Third-Party or Nested Errors

**Decision**: When an error originates from a nested or third-party component (e.g., config loader, SDK call), wrap it with context (e.g., stack name, construct id, or step name) and a clear, user-facing message. Preserve the original error for debugging (e.g., `cause`) without re-exposing sensitive details in the message.

**Rationale**: FR-007 requires that operators can locate the problem without inspecting internal implementation. CDK Toolkit docs suggest simple error handling with clear messages; wrapping preserves cause chain while meeting "context" and "remediation" where feasible.

**Alternatives considered**:
- Re-throw as-is: fails FR-007 (no context).
- Swallow cause: hurts debugging; rejected.

---

## 6. Log Sink and Environment

**Decision**: Do not depend on a specific log sink or transport. Write to stdout/stderr in a way that works when output is redirected or in CI; avoid assuming interactive TTY. If future tooling (e.g., CDK Toolkit Library custom `ioHost`) is introduced, keep the same message format so that logs remain consistent.

**Rationale**: Edge case in spec: "deployment is run in a context where logging output is restricted or redirected" — system must still behave correctly. Aligns with CDK Toolkit best practices (default responses for non-interactive environments, logging for troubleshooting).

**Alternatives considered**: None; requirement is explicit.

---

## Summary Table

| Topic | Decision | Source |
|-------|----------|--------|
| Logging | Structured, lifecycle-based; single format; no sink dependency | FR-001, SC-005; CDK Toolkit logging best practices |
| Validation errors | Aspects + Annotations.addError/addWarning; entry-point errors with shape (cause, context, hint) | CDK best practices; Toolkit error handling |
| Secrets | Never in logs or errors | FR-005, SC-004; AWS security practices |
| Documentation | Consistent JSDoc + comments; module and API level | FR-002, FR-003, FR-006; CDK construct design |
| Wrapped errors | Context + user message; preserve cause without leaking secrets | FR-007; Toolkit error handling |
| Environment | No dependency on specific sink; redirect/CI-safe | Spec edge case; Toolkit non-interactive guidance |

All NEEDS CLARIFICATION items from Technical Context were resolved from the feature spec and AWS MCP research; none remain.
