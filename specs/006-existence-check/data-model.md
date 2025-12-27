# Data Model: Two-Key Defense (Signing Secret + Bot Token)

**Feature**: 006-existence-check
**Date**: 2025-01-27

## Overview

This feature adds a DynamoDB cache table for storing Existence Check verification results. The cache reduces Slack API calls by storing successful verification results for 5 minutes.

## Entities

### ExistenceCheckCacheEntry

Represents a cached verification result for a team/user/channel combination.

**Table Name**: `slack-existence-check-cache`

**Partition Key**: `cache_key` (String)

**Attributes**:
- `cache_key` (String, Required): Composite key in format `{team_id}#{user_id}#{channel_id}`
  - Example: `T01234567#U01234567#C01234567`
  - Used as partition key for DynamoDB
- `ttl` (Number, Required): Unix timestamp when cache entry expires (TTL attribute)
  - Calculated as: `current_time + 300` (5 minutes = 300 seconds)
  - DynamoDB automatically deletes entries when TTL expires
- `verified_at` (Number, Optional): Unix timestamp when verification was performed
  - Used for debugging and monitoring
  - Not required for functionality

**TTL Configuration**:
- TTL Attribute: `ttl`
- TTL Duration: 300 seconds (5 minutes)
- Automatic cleanup: DynamoDB deletes expired entries automatically

**Example Entry**:
```json
{
  "cache_key": "T01234567#U01234567#C01234567",
  "ttl": 1738000000,
  "verified_at": 1737999700
}
```

**Validation Rules**:
- `cache_key` must match format: `{team_id}#{user_id}#{channel_id}`
- `team_id`, `user_id`, `channel_id` must be valid Slack IDs (alphanumeric, uppercase)
- `ttl` must be a positive integer (Unix timestamp)
- `ttl` must be greater than current time when entry is created

**State Transitions**:
1. **Created**: Entry created when verification succeeds
   - `cache_key`: Generated from team_id, user_id, channel_id
   - `ttl`: Set to current_time + 300
   - `verified_at`: Set to current_time
2. **Read**: Entry read when checking cache before Slack API call
   - If `ttl > current_time`: Entry is valid, use cached result
   - If `ttl <= current_time`: Entry expired, DynamoDB may have deleted it
3. **Expired**: Entry automatically deleted by DynamoDB when TTL expires
   - No explicit deletion needed
   - DynamoDB handles cleanup automatically

## Relationships

### ExistenceCheckCacheEntry → Slack API

- **Relationship**: Cache entry represents successful verification result from Slack API
- **Direction**: One-way (cache entry created after Slack API verification succeeds)
- **Lifetime**: Cache entry expires after 5 minutes, requiring fresh Slack API call

### ExistenceCheckCacheEntry → SlackEventHandler Lambda

- **Relationship**: Lambda reads/writes cache entries
- **Read**: Before calling Slack API, Lambda checks cache for existing entry
- **Write**: After successful Slack API verification, Lambda writes cache entry
- **Concurrency**: Multiple Lambda instances may read/write same cache key concurrently
  - DynamoDB handles concurrent writes (last write wins)
  - No race condition issues (cache is idempotent)

## Data Flow

### Cache Read Flow

```
1. Request arrives with team_id, user_id, channel_id
2. Generate cache_key: "{team_id}#{user_id}#{channel_id}"
3. Query DynamoDB: get_item(Key={'cache_key': cache_key})
4. If item exists and ttl > current_time:
   - Return cached result (skip Slack API call)
5. If item missing or expired:
   - Proceed to Slack API verification
```

### Cache Write Flow

```
1. Slack API verification succeeds (all entities exist)
2. Generate cache_key: "{team_id}#{user_id}#{channel_id}"
3. Calculate ttl: current_time + 300
4. Write DynamoDB: put_item(Item={cache_key, ttl, verified_at})
5. Continue request processing
```

## Constraints

### Cache Key Format

- **Format**: `{team_id}#{user_id}#{channel_id}`
- **Separator**: `#` (not used in Slack IDs)
- **Max Length**: ~100 characters (Slack IDs are typically 9-11 characters each)
- **Uniqueness**: Each team/user/channel combination has unique cache entry

### TTL Constraints

- **TTL Duration**: 300 seconds (5 minutes)
- **TTL Calculation**: `current_time + 300`
- **TTL Precision**: Unix timestamp (seconds)
- **Expiration**: DynamoDB automatically deletes expired entries (may take up to 48 hours)

### DynamoDB Constraints

- **Billing Mode**: PAY_PER_REQUEST (no capacity planning)
- **Read Capacity**: Unlimited (on-demand)
- **Write Capacity**: Unlimited (on-demand)
- **Item Size**: < 1KB per entry (well within DynamoDB 400KB limit)

## Out of Scope

- **Context History**: Existence Check cache is separate from context history (different TTL, different purpose)
- **Event Deduplication**: Existence Check cache is separate from event deduplication (different keys, different TTL)
- **Token Storage**: Existence Check cache is separate from token storage (different keys, different purpose)

