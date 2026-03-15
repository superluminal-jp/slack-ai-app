# Data Model: Agent List via Slack Reply

**Date**: 2026-02-20

## Entities

### AgentCard (read-only, in-memory cache)

Represents metadata for one registered execution agent. Populated at system startup via
agent card discovery. This feature reads from the cache; it does not mutate it.

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Human-readable agent name (e.g., "SlackAI-FileCreatorAgent") |
| `description` | string | Short description of the agent's purpose |
| `skills` | list[Skill] | Zero or more capabilities the agent exposes |

### Skill (nested in AgentCard)

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Skill identifier (e.g., "create_excel") |
| `description` | string | What the skill does |

### AgentRegistry (in-memory, keyed by agent_id)

```
agent_id (str) → AgentCard | None
```

- `None` means discovery failed or was not enabled for that agent.
- Features reads `get_all_cards()` which returns a snapshot dict.

## State Transitions

No new state. The `list_agents` route consumes the registry snapshot; it does not
modify `_AGENT_CARDS` or `_AGENT_ARNS`.

## Validation Rules

- If `AgentCard` is `None` for an agent_id → omit that agent from the formatted list.
- If all cards are `None` (or registry is empty) → emit "no agents available" message.
- `name` and `description` are rendered as-is; no escaping needed for Slack mrkdwn
  plain text (special chars like `<`, `>`, `&` should be escaped per Slack mrkdwn spec
  if present, but agent card content is system-controlled and assumed safe).
