# Data Model: S3 Agent Registry

**Date**: 2026-03-24
**Feature**: 054-ssm-agent-registry

## Entities

### Agent Registry Entry (Per-Agent S3 JSON File)

A single agent record stored as an individual S3 JSON file. Agent-id is derived from the filename.

**Location**: S3
**Key pattern**: `s3://{bucket}/{env}/agent-registry/{agent-id}.json`

| Field       | Type     | Required | Description                                                  |
|-------------|----------|----------|--------------------------------------------------------------|
| `arn`       | string   | Yes      | AgentCore Runtime ARN for `invoke_agent_runtime` invocation  |
| `description` | string | Yes      | Human-readable description used for LLM routing tool generation |
| `skills`    | array    | Yes      | List of skill objects used for Strands tool description       |

**Skill object structure**:

| Field         | Type   | Required | Description                    |
|---------------|--------|----------|--------------------------------|
| `id`          | string | Yes      | Unique skill identifier        |
| `name`        | string | Yes      | Human-readable skill name      |
| `description` | string | No       | Skill description for LLM      |

**Example** (Time Agent file: `dev/agent-registry/time.json`):
```json
{
  "arn": "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/SlackAI_TimeAgent_Dev-JlyS3bFYUU",
  "description": "現在日時取得専用エージェント。指定タイムゾーンの現在日時を返す。",
  "skills": [
    {
      "id": "current-time",
      "name": "Current Time",
      "description": "Get current date/time in specified timezone"
    }
  ]
}
```

### Agent Registry (S3 Prefix Directory)

The collection of per-agent JSON files under a common S3 prefix. Discovered via `ListObjectsV2` and read individually via `GetObject`.

**S3 prefix**: `s3://{bucket}/{env}/agent-registry/`

**Registered agents** (current):

| agent-id       | S3 key                                  |
|----------------|------------------------------------------|
| `time`         | `{env}/agent-registry/time.json`         |
| `docs`         | `{env}/agent-registry/docs.json`         |
| `fetch-url`    | `{env}/agent-registry/fetch-url.json`    |
| `file-creator` | `{env}/agent-registry/file-creator.json` |
| `slack-search` | `{env}/agent-registry/slack-search.json` |

**Example S3 listing** (`aws s3 ls s3://{bucket}/dev/agent-registry/`):
```
2026-03-24 10:00:00        256 time.json
2026-03-24 10:01:00        312 docs.json
2026-03-24 10:02:00        289 fetch-url.json
2026-03-24 10:03:00        301 file-creator.json
2026-03-24 10:04:00        278 slack-search.json
```

## Pydantic Models (In-Memory Representation)

Type-safe models for validation at both read (S3 → Python) and write (deploy → S3) boundaries.

```python
from pydantic import BaseModel

class AgentSkill(BaseModel):
    id: str
    name: str
    description: str = ""

class AgentRegistryEntry(BaseModel):
    arn: str  # ARN pattern validated
    description: str  # min_length=1
    skills: list[AgentSkill] = []
```

**Note**: No `AgentRegistry` RootModel needed — the registry is assembled in-memory from individual files, not parsed from a single consolidated JSON.

## In-Memory Representation (VerificationAgent)

After S3 prefix scan and per-file Pydantic validation, data maps to existing module-level state:

| Module variable   | Source                              | Type                         |
|-------------------|-------------------------------------|------------------------------|
| `_AGENT_ARNS`     | `entry.arn` per agent-id            | `Dict[str, str]`             |
| `_AGENT_CARDS`    | `entry.model_dump()` per agent-id   | `Dict[str, Optional[dict]]`  |

## State Transitions

```
Deploy Time:
  agent_card.py (static) → construct JSON → PutObject to S3 → {agent-id}.json

Container Startup:
  S3 prefix → ListObjectsV2 → [key1.json, key2.json, ...] → GetObject each →
  JSON parse → Pydantic validation → _AGENT_ARNS + _AGENT_CARDS (in-memory)

Request Time:
  _AGENT_CARDS → build_agent_tools() → Strands Agent tools
  _AGENT_ARNS → get_agent_arn(agent_id) → invoke_execution_agent(arn)

Refresh (lazy):
  S3 prefix → ListObjectsV2 → GetObject each → Pydantic validation →
  update _AGENT_ARNS + _AGENT_CARDS
```

## Validation Rules

- `arn` MUST be a valid ARN format (`arn:aws:bedrock-agentcore:*:*:runtime/*`)
- `description` MUST be non-empty string
- `skills` MUST be a list (may be empty)
- Each agent file MUST contain valid JSON parseable as `AgentRegistryEntry`; invalid files are skipped (ERROR log per file)
- `ListObjectsV2` failure → fail-open with empty registry (WARN log)
- Individual `GetObject` failure → skip that agent (ERROR log), continue loading others

## S3 Bucket Configuration (CDK)

- `blockPublicAccess: BlockPublicAccess.BLOCK_ALL`
- `enforceSSL: true`
- `encryption: BucketEncryption.S3_MANAGED` (SSE-S3)
- `versioned: true` (track registry history)
- `removalPolicy: RemovalPolicy.RETAIN` (don't delete on stack destroy)
- ACLs disabled (default)
