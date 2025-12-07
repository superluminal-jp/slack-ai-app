# Feature Specification: Two-Key Defense (Signing Secret + Bot Token)

**Feature Branch**: `006-existence-check`  
**Created**: 2025-01-27  
**Status**: Draft  
**Input**: User description: "2 鍵防御（Signing Secret + Bot Token）を実装"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Verify Real Slack Entities (Priority: P1)

When a request arrives from Slack, the system verifies that the team, user, and channel mentioned in the request actually exist in Slack before processing the request. This prevents attackers who have stolen only the Signing Secret from creating fake requests with made-up IDs (since they cannot call Slack API without Bot Token).

**Why this priority**: This is the core security feature that implements the second key in the two-key defense model. Without this, if the Signing Secret is leaked, attackers can forge requests with any team_id, user_id, or channel_id. Note: This does NOT verify request legitimacy (that is handled by signature verification), only that the entities exist in Slack.

**Independent Test**: Can be fully tested by sending a request with valid signature but invalid team_id/user_id/channel_id, and verifying the system rejects it with a 403 error. This delivers security value by blocking forged requests.

**Acceptance Scenarios**:

1. **Given** a request arrives with valid signature verification, **When** the system checks if team_id, user_id, and channel_id exist in Slack, **Then** all three entities must be verified as real before processing continues
2. **Given** a request with valid signature but fake team_id, **When** the system calls Slack API to verify the team, **Then** the request is rejected with 403 Forbidden and a security event is logged
3. **Given** a request with valid signature but fake user_id, **When** the system calls Slack API to verify the user, **Then** the request is rejected with 403 Forbidden and a security event is logged
4. **Given** a request with valid signature but fake channel_id, **When** the system calls Slack API to verify the channel, **Then** the request is rejected with 403 Forbidden and a security event is logged

---

### User Story 2 - Cache Verification Results (Priority: P2)

To minimize performance impact, the system caches successful verification results so that repeated requests from the same team/user/channel combination don't require additional Slack API calls.

**Why this priority**: Without caching, every request would require 3 Slack API calls, adding significant latency. Caching reduces this to near-zero for cached entries while maintaining security.

**Independent Test**: Can be fully tested by sending two identical requests and verifying the second request uses cached result (no Slack API calls) and completes faster. This delivers performance value by reducing latency.

**Acceptance Scenarios**:

1. **Given** a request is successfully verified, **When** the verification result is cached, **Then** subsequent requests with the same team_id/user_id/channel_id within 5 minutes use the cache and skip Slack API calls
2. **Given** a cached verification result exists, **When** a new request arrives with matching team_id/user_id/channel_id, **Then** the system uses the cached result and processes the request without calling Slack API
3. **Given** a cached verification result is older than 5 minutes, **When** a new request arrives, **Then** the system performs fresh verification and updates the cache

---

### User Story 3 - Handle Slack API Failures Securely (Priority: P2)

When Slack API is unavailable or returns errors, the system must fail securely by rejecting requests rather than allowing potentially forged requests through.

**Why this priority**: Security must take precedence over availability. If we can't verify entities, we must assume they're invalid to prevent attacks.

**Independent Test**: Can be fully tested by simulating Slack API timeouts or errors and verifying the system rejects requests with 403. This delivers security value by preventing bypass attacks.

**Acceptance Scenarios**:

1. **Given** Slack API times out after 2 seconds, **When** the system attempts to verify entities, **Then** the request is rejected with 403 Forbidden and a security event is logged
2. **Given** Slack API returns rate limit error (429), **When** the system has retry attempts remaining, **Then** the system retries with exponential backoff up to 3 times
3. **Given** Slack API returns rate limit error (429) after all retries, **When** the system cannot verify entities, **Then** the request is rejected with 403 Forbidden
4. **Given** Slack API returns any other error, **When** the system cannot verify entities, **Then** the request is rejected with 403 Forbidden and the error is logged

---

### Edge Cases

- What happens when team_id, user_id, or channel_id is missing from the request? → System skips existence check for missing fields but still verifies available fields
- How does system handle requests where Bot Token is not available? → System skips existence check and logs warning, but does not reject request (Bot Token may not be available for all teams)
- What happens when cache write fails? → System continues processing but logs warning; next request will perform fresh verification
- How does system handle concurrent requests for the same team/user/channel? → Each request performs verification independently; first successful verification caches result
- What happens when Slack API is completely down? → All requests are rejected with 403 (fail-closed security model)

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST verify team_id exists in Slack before processing requests
- **FR-002**: System MUST verify user_id exists in Slack before processing requests
- **FR-003**: System MUST verify channel_id exists in Slack before processing requests
- **FR-004**: System MUST reject requests with 403 Forbidden if any entity (team_id, user_id, channel_id) does not exist in Slack
- **FR-005**: System MUST cache successful verification results for 5 minutes to reduce Slack API calls
- **FR-006**: System MUST use cache key format `{team_id}#{user_id}#{channel_id}` for storing verification results
- **FR-007**: System MUST reject requests with 403 Forbidden if Slack API verification times out after 2 seconds
- **FR-008**: System MUST retry Slack API calls up to 3 times with exponential backoff when rate limited (429 error)
- **FR-009**: System MUST log all existence check failures as security events with team_id, user_id, channel_id, and error details
- **FR-010**: System MUST perform existence check after signature verification succeeds but before processing the request
- **FR-011**: System MUST skip existence check if Bot Token is not available (graceful degradation, but log warning)
- **FR-012**: System MUST skip existence check for missing team_id, user_id, or channel_id (verify only available fields)

### Key Entities _(include if feature involves data)_

- **Verification Cache Entry**: Represents a cached verification result for a team/user/channel combination. Contains cache key (team_id#user_id#channel_id), TTL timestamp, and verification timestamp. Used to avoid redundant Slack API calls.
- **Existence Check Result**: Represents the outcome of verifying entities against Slack API. Contains success/failure status, which entities were verified, and any error information. Used to make security decisions about request processing.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: System blocks 100% of requests with invalid team_id, user_id, or channel_id (entities that don't exist in Slack)
- **SC-002**: System completes existence check within 500ms for 95% of requests (including cache hits and Slack API calls)
- **SC-003**: System achieves cache hit rate of at least 80% for repeated requests from same team/user/channel combinations
- **SC-004**: System rejects all requests within 2 seconds when Slack API is unavailable (fail-closed security model)
- **SC-005**: System logs 100% of existence check failures as security events for audit and monitoring
- **SC-006**: System reduces security risk from Signing Secret leakage from "High" to "Medium" by requiring both Signing Secret and Bot Token for successful attacks (when only Signing Secret is leaked, Existence Check blocks attacks)
- **SC-007**: System clearly documents that Existence Check verifies entity existence only, not request legitimacy (which is verified by signature verification)

## Security Model & Limitations

### What Existence Check Verifies

Existence Check verifies that **entities exist in Slack**, but does NOT verify that:

- The request is a legitimate Slack event (this is verified by signature verification)
- The user has permission to access the channel (this would require additional authorization checks)
- The event actually occurred in Slack (this is verified by signature verification + event deduplication)

### What Signature Verification Verifies

Signature verification (HMAC SHA256) verifies that:

- The request was signed by someone who knows the Signing Secret
- The request has not been tampered with (body integrity)
- The request is recent (timestamp within ±5 minutes, prevents replay attacks)

**Important Limitation**: Signature verification does NOT directly prove that the request came from Slack. It proves that:

- Someone with access to the Signing Secret signed the request
- **Assumption**: Only Slack knows the Signing Secret (if this assumption is violated by leakage, signature verification alone cannot detect it)

**Why This Matters**: If Signing Secret is leaked, an attacker can generate valid signatures, and signature verification will pass. This is why Existence Check (requiring Bot Token) is needed as a second layer of defense.

### Two-Key Defense Model

The security model relies on two independent keys:

1. **Signing Secret (Key 1)**: Proves the request was signed by someone who knows the secret

   - Verified by HMAC SHA256 signature verification
   - **Assumption**: Only Slack knows the Signing Secret (if leaked, this assumption fails)
   - **What it proves**: "Someone with Signing Secret signed this" (not directly "Slack signed this")
   - If leaked alone: Attacker can forge requests, but Existence Check requires Bot Token

2. **Bot Token (Key 2)**: Required to call Slack API for Existence Check
   - Used to verify entities exist in Slack
   - **What it proves**: "Entities exist in Slack" (not "request came from Slack")
   - If leaked alone: Attacker can call Slack API but cannot forge signature

**Combined Defense**:

- Signature verification proves "signed with Signing Secret" (assumes only Slack has it)
- Existence Check proves "entities exist" (requires Bot Token that only legitimate app has)
- Together, they provide strong evidence that request is legitimate, but neither alone can prove "request came from Slack" with 100% certainty

### Attack Scenarios

**Scenario 1: Signing Secret only leaked**

- ✅ **Blocked**: Attacker can forge signature but cannot call Slack API (no Bot Token)
- Existence Check fails → Request rejected

**Scenario 2: Bot Token only leaked**

- ✅ **Blocked**: Attacker can call Slack API but cannot forge signature
- Signature verification fails → Request rejected

**Scenario 3: Both Signing Secret and Bot Token leaked**

- ❌ **Not blocked by Existence Check**: Attacker can forge requests with real IDs
- **Mitigation**: Requires both keys to be rotated immediately
- **Additional protection**: Event deduplication prevents replay attacks

**Scenario 4: Attacker knows real IDs but only has Signing Secret**

- ✅ **Blocked**: Attacker can forge signature with real IDs, but cannot call Slack API
- Existence Check fails → Request rejected

### Limitations

**Existence Check Limitations**:

- Existence Check does NOT verify request legitimacy beyond entity existence
- Existence Check does NOT verify user permissions or channel access
- Existence Check does NOT prevent attacks if both keys are leaked
- Existence Check requires Bot Token availability (may not be available for all teams)

**Signature Verification Limitations**:

- Signature verification does NOT directly prove "request came from Slack"
- Signature verification proves "signed by someone who knows Signing Secret"
- If Signing Secret is leaked, signature verification cannot detect forged requests
- Signature verification relies on the assumption that only Slack knows the Signing Secret

**Fundamental Security Limitation**:

- **No cryptographic proof of origin**: There is no way to cryptographically prove that a request came from Slack without additional out-of-band verification
- **Defense in depth**: Multiple layers (signature + existence check + event deduplication) provide strong evidence but not absolute proof
- **Key management is critical**: If both keys are leaked, all defenses fail - immediate rotation is required

## Assumptions

- Bot Token is available for teams that have installed the Slack app (stored in DynamoDB or environment variables)
- Slack API (team.info, users.info, conversations.info) is generally available with <2 second response times
- DynamoDB is available for caching verification results
- System can tolerate 200-500ms additional latency for cache misses (acceptable trade-off for security)
- Security takes precedence over availability (fail-closed model when verification cannot be performed)
- Signature verification (Signing Secret) is the primary mechanism for verifying request legitimacy from Slack
- Existence Check is a secondary defense layer that reduces attack surface when Signing Secret is leaked

## Dependencies

- Slack API access (team.info, users.info, conversations.info methods)
- Bot Token availability (from token storage or environment variables)
- DynamoDB table for caching (must be created with TTL support)
- Existing signature verification must succeed before existence check runs
- Logging infrastructure for security event logging

## Out of Scope

- Rotating Signing Secret or Bot Token (handled by separate processes)
- Static whitelist of team_id/user_id/channel_id (replaced by dynamic verification)
- IP-based filtering (not part of this feature)
- Nonce tracking for replay attack prevention (handled by timestamp validation in signature verification)
