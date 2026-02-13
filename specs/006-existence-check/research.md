# Research: Two-Key Defense (Signing Secret + Bot Token)

**Feature**: 006-existence-check
**Date**: 2025-01-27
**Purpose**: Resolve technical clarifications and establish best practices for Existence Check implementation

## Overview

This document resolves technical questions and establishes implementation patterns for the Slack API Existence Check feature, which implements the second key in the two-key defense model.

## Research Tasks

### 1. Slack API Methods for Entity Verification

**Question**: Which Slack API methods should be used to verify team_id, user_id, and channel_id exist?

**Decision**: Use team.info, users.info, and conversations.info methods

**Rationale**:
- **team.info**: Verifies workspace (team) exists and returns team metadata
- **users.info**: Verifies user exists in the workspace and returns user metadata
- **conversations.info**: Verifies channel exists and returns channel metadata
- All three methods require Bot Token (xoxb-...) for authentication
- All three methods return `{"ok": true}` on success, `{"ok": false, "error": "..."}` on failure
- Error codes: "team_not_found", "user_not_found", "channel_not_found" indicate invalid entities

**Implementation**:
```python
# Using slack-sdk WebClient
client = WebClient(token=bot_token)

# Verify team
team_info = client.team_info(team=team_id)
if not team_info.get("ok"):
    raise ExistenceCheckError(f"Invalid team_id: {team_id}")

# Verify user
user_info = client.users_info(user=user_id)
if not user_info.get("ok"):
    raise ExistenceCheckError(f"Invalid user_id: {user_id}")

# Verify channel
channel_info = client.conversations_info(channel=channel_id)
if not channel_info.get("ok"):
    raise ExistenceCheckError(f"Invalid channel_id: {channel_id}")
```

**Alternatives Considered**:
- **auth.test**: Only verifies token validity, not entity existence
- **conversations.list**: Would require pagination and filtering, inefficient
- **users.list**: Would require pagination and filtering, inefficient

---

### 2. DynamoDB Cache Table Design

**Question**: How should the Existence Check cache table be structured?

**Decision**: Use DynamoDB table with partition key (cache_key) and TTL attribute

**Rationale**:
- **Partition Key**: `cache_key` (format: `{team_id}#{user_id}#{channel_id}`)
- **TTL Attribute**: `ttl` (Unix timestamp, 5 minutes = 300 seconds from current time)
- **Billing Mode**: PAY_PER_REQUEST (minimizes costs, no capacity planning)
- **Encryption**: AWS managed keys (default, sufficient for cache data)
- **Removal Policy**: DESTROY (cache can be rebuilt, no data loss risk)

**Implementation**:
```typescript
// CDK Construct
const existenceCheckCacheTable = new dynamodb.Table(
  this,
  "ExistenceCheckCache",
  {
    tableName: "slack-existence-check-cache",
    partitionKey: {
      name: "cache_key",
      type: dynamodb.AttributeType.STRING,
    },
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    encryption: dynamodb.TableEncryption.AWS_MANAGED,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    timeToLiveAttribute: "ttl",
  }
);
```

**Cache Entry Structure**:
```python
{
    "cache_key": "T01234567#U01234567#C01234567",
    "ttl": 1738000000,  # Unix timestamp (current_time + 300)
    "verified_at": 1737999700  # Unix timestamp when verified
}
```

**Alternatives Considered**:
- **ElastiCache (Redis)**: Over-engineered for 5-minute TTL; adds VPC complexity
- **In-memory cache (Lambda)**: Lost on cold starts; not shared across Lambda instances
- **No cache**: Would require 3 Slack API calls per request, adding 200-500ms latency

---

### 3. Slack API Rate Limiting and Retry Strategy

**Question**: How should the system handle Slack API rate limits (429 errors)?

**Decision**: Implement exponential backoff retry (max 3 attempts) with 2-second timeout

**Rationale**:
- **Slack API Rate Limits**: Tier 2 = 20 requests/minute per method
- **Retry Strategy**: Exponential backoff (1s, 2s, 4s delays) up to 3 attempts
- **Timeout**: 2 seconds per attempt (fail-closed security model)
- **Total Max Time**: ~7 seconds (2s timeout × 3 attempts + backoff delays)
- **Fail-Closed**: If all retries fail, reject request with 403 Forbidden

**Implementation**:
```python
import time
from slack_sdk.errors import SlackApiError

max_retries = 3
timeout = 2  # seconds

for attempt in range(max_retries):
    try:
        client = WebClient(token=bot_token, timeout=timeout)
        team_info = client.team_info(team=team_id)
        if not team_info.get("ok"):
            raise ExistenceCheckError(f"Invalid team_id: {team_id}")
        break  # Success
    except SlackApiError as e:
        if e.response.get("status_code") == 429:
            if attempt < max_retries - 1:
                # Exponential backoff: 1s, 2s, 4s
                delay = 2 ** attempt
                time.sleep(delay)
                continue
            else:
                raise ExistenceCheckError("Slack API rate limit exceeded")
        else:
            raise ExistenceCheckError(f"Slack API error: {e.response.get('error')}")
    except Exception as e:
        # Timeout or other error
        raise ExistenceCheckError(f"Existence check failed: {str(e)}")
```

**Alternatives Considered**:
- **No retry**: Would reject legitimate requests during rate limit spikes
- **Linear backoff**: Exponential backoff is standard practice for rate limits
- **Longer timeout**: 2 seconds is sufficient; longer timeouts delay fail-closed response

---

### 4. Fail-Closed Security Model

**Question**: What should happen when Slack API is unavailable or times out?

**Decision**: Reject all requests with 403 Forbidden (fail-closed security model)

**Rationale**:
- **Security Priority**: Security takes precedence over availability
- **Attack Prevention**: If we cannot verify entities, assume they are invalid
- **Timeout**: 2 seconds per API call (3 calls × 2s = 6s max for all verifications)
- **Logging**: All failures logged as security events for audit
- **User Impact**: Temporary unavailability is acceptable trade-off for security

**Implementation**:
```python
try:
    # Verify entities
    check_entity_existence(bot_token, team_id, user_id, channel_id)
except ExistenceCheckError as e:
    # Log security event
    log_error("existence_check_failed", {
        "team_id": team_id,
        "user_id": user_id,
        "channel_id": channel_id,
        "error": str(e)
    })
    # Reject request
    return {
        "statusCode": 403,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"error": "Entity verification failed"})
    }
```

**Alternatives Considered**:
- **Fail-open**: Would allow potentially forged requests through (security risk)
- **Graceful degradation**: Would require complex logic to determine when to fail-open vs fail-closed
- **Cached-only mode**: Would require longer cache TTL, reducing security effectiveness

---

### 5. Bot Token Availability Handling

**Question**: What should happen when Bot Token is not available for a team?

**Decision**: Skip Existence Check, log warning, but do not reject request (graceful degradation)

**Rationale**:
- **Edge Case**: Bot Token may not be available for all teams (e.g., during app installation)
- **Backward Compatibility**: Existing requests should not be broken
- **Security Trade-off**: Acceptable because signature verification still validates request
- **Logging**: Warning logged for monitoring and potential issues

**Implementation**:
```python
bot_token = get_token(team_id) or os.environ.get("SLACK_BOT_TOKEN")

if bot_token and team_id and user_id and channel_id:
    try:
        check_entity_existence(bot_token, team_id, user_id, channel_id)
    except ExistenceCheckError as e:
        # Reject request
        return {"statusCode": 403, ...}
else:
    # Bot Token not available - skip Existence Check
    log_warn("existence_check_skipped", {
        "reason": "bot_token_unavailable",
        "team_id": team_id
    })
    # Continue processing (graceful degradation)
```

**Alternatives Considered**:
- **Reject request**: Would break existing functionality for teams without Bot Token
- **Require Bot Token**: Would require all teams to have Bot Token (not always available)

---

### 6. Cache Key Format and Collision Prevention

**Question**: What format should be used for cache keys to prevent collisions?

**Decision**: Use `{team_id}#{user_id}#{channel_id}` format with `#` separator

**Rationale**:
- **Separator**: `#` is not used in Slack IDs (which use alphanumeric + uppercase)
- **Format**: Simple concatenation with separator prevents collisions
- **Example**: `T01234567#U01234567#C01234567`
- **Uniqueness**: Each team/user/channel combination has unique cache entry
- **Readability**: Easy to debug and inspect in DynamoDB console

**Alternatives Considered**:
- **JSON string**: More complex parsing, larger key size
- **Base64 encoding**: Unnecessary complexity, reduces readability
- **Hash (MD5/SHA256)**: Prevents debugging, adds computation overhead

---

## Implementation Patterns

### Error Handling Pattern

```python
class ExistenceCheckError(Exception):
    """Raised when entity existence check fails"""
    pass

def check_entity_existence(...) -> bool:
    try:
        # Verify entities
        ...
    except SlackApiError as e:
        error_code = e.response.get("error", "unknown")
        if error_code == "team_not_found":
            raise ExistenceCheckError(f"Team not found: {team_id}")
        elif error_code == "user_not_found":
            raise ExistenceCheckError(f"User not found: {user_id}")
        elif error_code == "channel_not_found":
            raise ExistenceCheckError(f"Channel not found: {channel_id}")
        elif e.response.get("status_code") == 429:
            raise ExistenceCheckError("Slack API rate limit exceeded")
        else:
            raise ExistenceCheckError(f"Slack API error: {error_code}")
    except Exception as e:
        raise ExistenceCheckError(f"Existence check failed: {str(e)}")
```

### Caching Pattern

```python
def get_from_cache(cache_key: str) -> Optional[Dict]:
    """Get cached verification result from DynamoDB"""
    try:
        table = get_cache_table()
        if not table:
            return None
        response = table.get_item(Key={'cache_key': cache_key})
        item = response.get('Item')
        if item and item.get('ttl', 0) > int(time.time()):
            return item
        return None
    except Exception as e:
        log_warn("existence_check_cache_read_failed", {
            "cache_key": cache_key,
            "error": str(e)
        })
        return None

def save_to_cache(cache_key: str, ttl: int):
    """Save verification result to DynamoDB cache"""
    try:
        table = get_cache_table()
        if not table:
            return
        table.put_item(
            Item={
                'cache_key': cache_key,
                'ttl': int(time.time()) + ttl,
                'verified_at': int(time.time())
            }
        )
    except Exception as e:
        log_warn("existence_check_cache_save_failed", {
            "cache_key": cache_key,
            "error": str(e)
        })
```

## References

- [Slack API: team.info](https://api.slack.com/methods/team.info)
- [Slack API: users.info](https://api.slack.com/methods/users.info)
- [Slack API: conversations.info](https://api.slack.com/methods/conversations.info)
- [Slack API Rate Limits](https://api.slack.com/docs/rate-limits)
- [AWS DynamoDB TTL](https://docs.aws.amazon.com/amazon-dynamodb/latest/developerguide/TTL.html)
- [ADR-004: Slack API Existence Check](../../docs/developer/adr/004-slack-api-existence-check.md)

