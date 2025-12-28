# Feature Specification: Dual Authentication Support for Inter-Stack Communication

**Feature Branch**: `012-api-key-auth`  
**Created**: 2025-01-30  
**Status**: Draft  
**Input**: User description: "Verification Stack と Execution Stack の間の通信はIAM認証に加えてAPIキーを使った認証にも対応できるように改良。将来的にIAM認証ができないAPIを使用することを念頭に設計。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - API Key Authentication Support (Priority: P1)

As a system architect, I need the system to support API key authentication in addition to IAM authentication for communication between Verification Stack and Execution Stack, so that the system can work with APIs that do not support IAM authentication.

**Why this priority**: This is the core functionality that enables future compatibility with non-AWS APIs or APIs that don't support IAM authentication. It provides flexibility for system evolution.

**Independent Test**: Can be tested by configuring the system to use API key authentication and verifying that requests are successfully authenticated and processed, while maintaining the same functionality as IAM authentication.

**Acceptance Scenarios**:

1. **Given** the system is configured to use API key authentication, **When** Verification Stack sends a request to Execution Stack with a valid API key, **Then** the request is authenticated and processed successfully
2. **Given** the system is configured to use API key authentication, **When** Verification Stack sends a request with an invalid or missing API key, **Then** the request is rejected with an authentication error
3. **Given** the system supports both IAM and API key authentication, **When** a request is made, **Then** the system uses the configured authentication method correctly
4. **Given** API key authentication is enabled, **When** a request is processed, **Then** the end-user experience remains unchanged (same response time and behavior as IAM authentication)

---

### User Story 2 - Seamless Authentication Method Selection (Priority: P1)

As a system operator, I need the system to automatically select the appropriate authentication method based on configuration, so that I can switch between IAM and API key authentication without code changes.

**Why this priority**: Operational flexibility is essential for adapting to different deployment scenarios and future API integrations. The system should support both methods without requiring code modifications.

**Independent Test**: Can be tested by changing configuration to switch between IAM and API key authentication and verifying that the system uses the correct method without errors.

**Acceptance Scenarios**:

1. **Given** the system is configured to use IAM authentication, **When** Verification Stack sends a request, **Then** the request uses IAM authentication (SigV4 signing)
2. **Given** the system is configured to use API key authentication, **When** Verification Stack sends a request, **Then** the request includes the API key in the appropriate header
3. **Given** the authentication method is changed via configuration, **When** the system processes requests, **Then** it uses the new authentication method without requiring code deployment
4. **Given** both authentication methods are supported, **When** a request is made, **Then** only one authentication method is used per request (no dual authentication)

---

### User Story 3 - Secure API Key Management (Priority: P2)

As a security administrator, I need API keys to be stored and managed securely, so that unauthorized access to API keys is prevented.

**Why this priority**: API keys are sensitive credentials that must be protected. Secure storage and management are essential for maintaining system security.

**Independent Test**: Can be tested by verifying that API keys are stored in secure storage (e.g., AWS Secrets Manager) and are not exposed in logs, environment variables, or code.

**Acceptance Scenarios**:

1. **Given** API keys are stored in secure storage, **When** the system retrieves an API key, **Then** it accesses the key from secure storage (not hardcoded or in plain text)
2. **Given** API keys are used for authentication, **When** requests are logged, **Then** API key values are not included in log entries
3. **Given** API keys need to be rotated, **When** a new API key is configured, **Then** the system can use the new key without downtime
4. **Given** API key authentication is enabled, **When** the system processes requests, **Then** API keys are retrieved securely and used only for authentication purposes

---

### Edge Cases

- What happens when both IAM and API key authentication are configured simultaneously?
- How does the system handle API key retrieval failures from secure storage?
- What happens when an API key expires or is revoked?
- How does the system behave if the authentication method configuration is invalid or missing?
- What happens when a request includes both IAM credentials and API key (should one take precedence)?
- How are authentication failures logged and monitored for both IAM and API key methods?
- What happens if the secure storage for API keys is temporarily unavailable?
- How does the system handle API key rotation during active requests?
- What happens when switching authentication methods while requests are in flight?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support API key authentication as an alternative to IAM authentication for communication between Verification Stack and Execution Stack
- **FR-002**: System MUST support IAM authentication (existing functionality) for communication between Verification Stack and Execution Stack
- **FR-003**: System MUST allow configuration to select between IAM and API key authentication methods
- **FR-004**: System MUST authenticate requests using only one authentication method per request (IAM or API key, not both)
- **FR-005**: System MUST store API keys in secure storage (e.g., AWS Secrets Manager) and retrieve them at runtime
- **FR-006**: System MUST reject requests with invalid, missing, or expired API keys with appropriate authentication errors
- **FR-007**: System MUST reject requests with invalid IAM credentials when IAM authentication is configured
- **FR-008**: System MUST maintain the same request/response payload structure regardless of authentication method used
- **FR-009**: System MUST log authentication method used for each request (without exposing sensitive credentials)
- **FR-010**: System MUST support API key rotation without requiring code changes or downtime
- **FR-011**: System MUST ensure API keys are never logged, exposed in error messages, or included in response payloads
- **FR-012**: System MUST maintain backward compatibility with existing IAM authentication when API key authentication is not configured
- **FR-013**: System MUST handle authentication method configuration errors gracefully with clear error messages
- **FR-014**: System MUST support future APIs that require API key authentication but do not support IAM authentication

### Key Entities

- **Authentication Configuration**: Settings that determine which authentication method (IAM or API key) is used for inter-stack communication
- **API Key**: Secret credential used for API key authentication, stored securely and retrieved at runtime
- **Authentication Method**: The selected method (IAM or API key) for authenticating a specific request
- **Secure Storage**: System for storing API keys securely (e.g., AWS Secrets Manager) with access controls and encryption
- **Authentication Request**: Request from Verification Stack to Execution Stack with appropriate authentication credentials (IAM signature or API key)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: System successfully authenticates requests using API key authentication with ≥99.9% success rate for valid API keys
- **SC-002**: System successfully authenticates requests using IAM authentication with ≥99.9% success rate (maintains existing performance)
- **SC-003**: System rejects 100% of requests with invalid API keys or missing API keys when API key authentication is required
- **SC-004**: System rejects 100% of requests with invalid IAM credentials when IAM authentication is required
- **SC-005**: End-to-end request processing time remains within existing performance targets (≤5% increase compared to IAM-only authentication) regardless of authentication method
- **SC-006**: System can switch between IAM and API key authentication via configuration without code deployment or downtime
- **SC-007**: API keys are stored in secure storage with encryption at rest and in transit, with 0% exposure in logs, error messages, or code
- **SC-008**: System maintains 100% backward compatibility with existing IAM authentication when API key authentication is not configured
- **SC-009**: All authentication events (successes and failures for both methods) are logged and available for security monitoring within 1 minute
- **SC-010**: System supports future APIs that require API key authentication, enabling integration without architectural changes

## Assumptions *(if applicable)*

- API Gateway REST API can be configured to support both IAM and API key authentication methods (either simultaneously or via configuration)
- Secure storage for API keys (e.g., AWS Secrets Manager) is available and accessible to Verification Stack
- API keys can be retrieved from secure storage with acceptable latency (less than 100ms overhead)
- Execution Stack (API Gateway) can validate API keys and authenticate requests accordingly
- The system can determine which authentication method to use based on configuration without requiring code changes
- API key format and validation requirements are known or can be standardized
- Both authentication methods can coexist in the system architecture without conflicts
- API key rotation can be performed by updating secure storage without code changes
- Existing IAM authentication implementation remains functional and is not degraded by adding API key support
- Future APIs that require API key authentication will follow standard API key authentication patterns (header-based, query parameter, etc.)

## Dependencies *(if applicable)*

- Existing IAM authentication implementation (Feature 002-iam-layer-auth) must remain functional
- API Gateway REST API infrastructure must support API key authentication configuration
- Secure storage service (e.g., AWS Secrets Manager) must be available for API key storage
- Verification Stack must have permissions to access secure storage for API key retrieval
- Execution Stack (API Gateway) must be able to validate API keys and authenticate requests

## Out of Scope *(if applicable)*

- Implementation of specific future APIs that will use API key authentication (this feature only enables the capability)
- API key generation or management UI (API keys are assumed to be provided externally)
- Support for other authentication methods beyond IAM and API key (OAuth, JWT, etc.)
- Migration of existing IAM-authenticated requests to API key authentication (both methods can coexist)
- Changes to Execution Stack Lambda function logic (only authentication layer is modified)
- Support for multiple API keys per request or key rotation during request processing
- Custom API key validation logic beyond standard API Gateway capabilities

