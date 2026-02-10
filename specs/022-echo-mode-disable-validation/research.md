# Research: Echo Mode Disable — Full Pipeline Validation with TDD

**Branch**: `022-echo-mode-disable-validation` | **Date**: 2026-02-09

## R-001: Existing Test Coverage Gap Analysis

**Decision**: Enhance existing test suite with TDD approach for echo-mode-off path, rather than replacing tests.

**Rationale**: The current `test_main.py` has 63 test methods across 11 test classes. Echo mode tests (018) and basic security pipeline tests exist but lack:
- Comprehensive error-path testing for execution delegation (only `bedrock_timeout` and generic exception tested)
- Structured log output verification
- Echo mode environment variable edge cases (`True`, `TRUE`, whitespace padding)
- File artifact error scenarios (invalid Base64, missing fields)
- Rate limit exception path (`RateLimitExceededError` exception class vs tuple return)

**Alternatives considered**:
- Full rewrite of test suite: Rejected — existing 63 tests provide solid foundation
- Integration tests with moto: Rejected for this iteration — unnecessary complexity given existing mock patterns work well. Noted for future enhancement.

## R-002: AWS Best Practices for Structured Logging

**Decision**: Maintain current `_log()` pattern in `pipeline.py` (JSON to stdout via `print`) with enhancements for duration tracking and security event classification.

**Rationale**: The existing `_log()` function already emits structured JSON to stdout with `level`, `event_type`, `service`, `timestamp`, and `correlation_id`. This is compatible with CloudWatch Logs and AgentCore container log capture. AWS Lambda Powertools Logger is not applicable (this runs on AgentCore Runtime, not Lambda). The pattern aligns with AWS Well-Architected Operational Excellence — structured logging with correlation IDs for distributed tracing.

**Enhancements identified**:
1. Add `duration_ms` to each security check step log (currently only on final `a2a_task_completed`)
2. Ensure all error paths log before returning (some exception handlers log, some don't)
3. Add `step` field to security check logs for pipeline stage identification

**Alternatives considered**:
- Python `logging` module with JSON formatter: Adds complexity without benefit — `print(json.dumps(...))` is idiomatic for containers
- AWS Lambda Powertools: Not applicable for AgentCore Runtime containers
- OpenTelemetry: Overkill for current scale; AgentCore Runtime has built-in OTEL support

## R-003: Error Handling Patterns for Execution Delegation

**Decision**: Apply defensive error handling with user-friendly error mapping for all Execution Agent failure modes.

**Rationale**: The existing `ERROR_MESSAGE_MAP` covers 9 error codes. The execution delegation try/except block catches generic `Exception` and posts a fallback message. AWS Builders Library recommends:
- Distinguish retriable vs non-retriable errors
- Use structured error responses with error codes
- Never expose internal error details to users

**Current gaps**:
1. `parse_file_artifact` returns `None` silently on invalid Base64 — should log the failure
2. Execution Agent response parsing assumes valid JSON — should handle `json.JSONDecodeError`
3. Missing test for execution agent returning non-JSON response

**Alternatives considered**:
- Circuit breaker (pybreaker): Overkill — AgentCore handles container health/restart
- Retry with tenacity: Not applicable — AgentCore manages invocation retries
- boto3 retry config: Already handled by `a2a_client.py` internal retry logic

## R-004: TDD Approach for This Feature

**Decision**: Write new tests first (RED), then modify implementation to pass (GREEN), then refactor. Commit tests separately before implementation.

**Rationale**: The spec explicitly requires TDD (FR-006, SC-003). The existing codebase uses `pytest` with `unittest.mock`. New tests will follow the established patterns in `test_main.py`:
- Class-based test organization by feature area
- `@patch` decorators for external dependencies
- `handle_message()` as the primary entry point under test
- JSON assertions on return values

**TDD cycle for this feature**:
1. RED: Write `Test022EchoModeDisabledNormalFlow` — tests for full pipeline with echo mode off
2. RED: Write `Test022ExecutionErrorHandling` — tests for all error mapping paths
3. RED: Write `Test022StructuredLogging` — tests verifying log output format
4. RED: Write `Test022EdgeCases` — environment variable parsing, invalid responses
5. GREEN: Modify `pipeline.py` to pass new tests (minimal changes expected — most paths already work)
6. REFACTOR: Improve code clarity while maintaining green tests

**Alternatives considered**:
- Write tests and implementation together: Rejected — violates explicit TDD requirement
- Write tests after implementation: Rejected — contradicts FR-006

## R-005: AWS Well-Architected Framework Alignment

**Decision**: Verify and document alignment with Operational Excellence, Reliability, and Security pillars. No new infrastructure changes required.

**Rationale**: The existing architecture already follows key practices:
- **Operational Excellence**: Structured JSON logging, infrastructure as code (CDK), environment-based configuration
- **Reliability**: SQS-based async processing, DynamoDB for state, error handling with fallbacks
- **Security**: SigV4 authentication, HMAC signature verification, whitelist authorization, rate limiting

**Improvements to validate/implement**:
1. All log entries include `correlation_id` for request tracing
2. Error messages never expose internal details (stack traces, ARNs, tokens)
3. Security check pipeline order is correct (existence → authorization → rate limit)
4. `is_processing` flag correctly reset on all error paths

**Alternatives considered**:
- Add CloudWatch custom metrics for each pipeline step: Deferred — `cloudwatch_metrics.py` exists but expanding it is out of scope
- Add X-Ray tracing: Deferred — AgentCore has built-in OTEL support
