<!--
Sync Impact Report:
Version change: 0.0.0 → 1.0.0 (Initial constitution creation from README.md)
Modified principles: N/A (new constitution)
Added sections: Security Requirements, Development Workflow, Governance
Templates requiring updates:
  ✅ .specify/templates/plan-template.md - Constitution Check section aligns with security-first principles
  ✅ .specify/templates/spec-template.md - Requirements section aligns with security and compliance requirements
  ✅ .specify/templates/tasks-template.md - Task organization aligns with security-first and testing discipline
Follow-up TODOs: None
-->

# Slack AI App Constitution

## Core Principles

### I. Security-First Architecture (NON-NEGOTIABLE)

All features MUST implement multi-layer defense: HMAC SHA256 signature verification, authorization checks, input sanitization, and AI-specific protections (Guardrails, PII detection). Security is not optional—every component must enforce authentication, authorization, and data protection. Rationale: Slack-to-AWS integration handles sensitive user data and AI interactions; security breaches could expose PII, enable prompt injection attacks, or cause unauthorized access.

### II. Non-Blocking Async Processing

All long-running operations (Bedrock API calls: 5-30 seconds) MUST use asynchronous patterns to avoid blocking user requests. Lambda① responds immediately (≤2 seconds) with acknowledgment, then Lambda② processes in background and posts to response_url. Rationale: Slack enforces 3-second timeout; Bedrock processing takes 5-30 seconds. Async pattern ensures user experience while maintaining system responsiveness.

### III. Context History Management

All AI interactions MUST maintain user/channel-scoped context history in DynamoDB (encrypted with KMS). Context MUST be isolated per user-channel pair, limited to 5 turns, and support reset operations. Rationale: Enables conversational AI capabilities while preventing cross-user data leakage and managing token costs.

### IV. Observability & Monitoring (MANDATORY)

All operations MUST emit structured JSON logs with correlation IDs, timestamps, and event types. PII MUST NOT appear in logs. CloudWatch metrics and alarms MUST track security events (signature failures, prompt injection, Guardrails blocks), performance (latency p95), and errors. Rationale: Enables incident response, security auditing, performance optimization, and compliance reporting (SOC 2, GDPR).

### V. Error Handling & Resilience

All error conditions MUST be handled gracefully with user-friendly messages. Timeouts, token limits, Guardrails blocks, and API failures MUST not crash the system. Failures MUST be logged with correlation IDs for debugging. Rationale: AI systems are inherently probabilistic; robust error handling ensures reliability and user trust.

### VI. Cost Management

All Bedrock invocations MUST enforce token limits (4000 tokens/request) and user-level quotas. Cost monitoring MUST track per-user spending (target: ≤$10/month/user). Rationale: Uncontrolled AI usage can lead to exponential cost growth; proactive limits protect budget while maintaining functionality.

### VII. Compliance Standards

All implementations MUST comply with SOC 2 Type II, GDPR, Japanese Personal Information Protection Act, EU AI Act (2024), and ISO/IEC 42001. PII detection, encryption at rest (DynamoDB + KMS), audit logging (CloudTrail), and data minimization are mandatory. Rationale: Legal and regulatory requirements; non-compliance risks fines, legal action, and reputation damage.

### VIII. Testing Discipline

All security-critical features (signature verification, prompt injection detection, PII filtering) MUST have BDD test scenarios (Gherkin). Integration tests MUST cover end-to-end flows. Security tests MUST validate threat model mitigations. Rationale: AI systems have unique attack vectors (prompt injection, jailbreaking); comprehensive testing prevents vulnerabilities.

## Security Requirements

### Authentication & Authorization

- HMAC SHA256 signature verification for all Slack requests (Lambda①)
- Timestamp validation (±5 minutes) to prevent replay attacks
- Whitelist-based authorization (team_id, user_id, channel_id)
- IAM authentication for internal API calls (API Gateway②)

### AI-Specific Protections

- Bedrock Guardrails with Automated Reasoning (99% accuracy) for prompt injection detection
- Multi-layer prompt injection detection: Lambda① pattern matching + Lambda② Guardrails
- PII detection and masking (regex-based for Japanese support; AWS Comprehend not available for Japanese)
- Token limits enforced (4000 tokens/request) to prevent abuse

### Data Protection

- DynamoDB encryption at rest (KMS)
- Context history isolation per user-channel pair
- No PII in logs (structured logging with hashing where needed)
- CloudTrail audit logging for all Bedrock API calls

## Development Workflow

### Code Standards

- Python 3.11 with type hints on all functions
- Structured JSON logging (correlation IDs, no PII)
- Error handling with specific exception types
- Documentation: Google/NumPy docstring style for public APIs

### Review Process

- All PRs MUST verify constitution compliance
- Security review required for authentication, authorization, and AI protection changes
- BDD test scenarios required for security features
- Performance testing required for latency-sensitive paths (p95 ≤35 seconds)

### Quality Gates

- Constitution Check: Must pass before Phase 0 research and after Phase 1 design
- Security audit: Zero vulnerabilities before production deployment
- Compliance review: Quarterly review of PII detection accuracy and Guardrails effectiveness
- Cost review: Monthly analysis of per-user Bedrock costs

## Governance

This constitution supersedes all other development practices. Amendments require:

1. Documentation of rationale and impact analysis
2. Approval from Security Architecture Team + AI Operations Team
3. Version bump according to semantic versioning:
   - MAJOR: Backward incompatible principle removals or redefinitions
   - MINOR: New principle/section added or materially expanded guidance
   - PATCH: Clarifications, wording, typo fixes, non-semantic refinements
4. Update of dependent templates (plan-template.md, spec-template.md, tasks-template.md)
5. Sync Impact Report documenting changes

All PRs and code reviews MUST verify compliance with this constitution. Complexity must be justified with explicit rationale. Use README.md for runtime development guidance and architecture details.

**Version**: 1.0.0 | **Ratified**: 2025-01-15 | **Last Amended**: 2025-01-15
