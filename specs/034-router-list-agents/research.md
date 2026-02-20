# Research: Agent List via Slack Reply

**Date**: 2026-02-20

## Decision 1: Where to add the list_agents handler

**Decision**: Add handler in `pipeline.py` immediately after `route_request()` returns
`LIST_AGENTS_AGENT_ID` — parallel to the existing `UNROUTED_AGENT_ID` branch.

**Rationale**: The pipeline already branches on special agent IDs at line 581. Adding
`list_agents` as a peer branch keeps the pattern consistent and ensures all security
checks (lines 325–481) execute before the list is compiled.

**Alternatives considered**:
- Pre-routing interception (before `route_request()`): rejected — user explicitly
  requested LLM-based detection, not rule-based keyword matching.
- New module `list_agents_handler.py`: rejected — overkill for two small functions;
  keeping them in `pipeline.py` avoids cross-module coupling.

## Decision 2: Router prompt extension

**Decision**: Add one line to `_build_router_system_prompt()` in `router.py`:
```
- list_agents: Return the list of available agents. Use when the user asks what
  agents are available, what the bot can do, or requests a capability overview.
```
This line is inserted between the `unrouted` option and the first execution-agent option
so the LLM sees it in priority order.

**Rationale**: The router already iterates `sorted(available_agent_ids)` to build the
prompt. `list_agents` is a special ID (not in `get_agent_ids()`) so it needs to be
described explicitly — exactly as `unrouted` is today.

**Alternatives considered**:
- Add `list_agents` to the agent registry: rejected — it has no ARN or card; treating
  it as a registry entry would require special-casing the ARN lookup anyway.

## Decision 3: Slack message format

**Decision**: Plain text with Slack mrkdwn bold (`*name*`) and bullet lists (`•`).
No Block Kit.

**Rationale**: Spec assumption §Assumptions states Block Kit is out of scope.
Current `send_slack_post_request()` already handles mrkdwn. Zero API changes needed.

**Alternatives considered**:
- Block Kit sections: provides richer layout but requires changes to the Slack poster
  contract. Not justified for this feature.

## Decision 4: Constant location

**Decision**: Define `LIST_AGENTS_AGENT_ID = "list_agents"` in `router.py` alongside
`UNROUTED_AGENT_ID = "unrouted"`. Import it in `pipeline.py`.

**Rationale**: Both special IDs originate in the router; keeping them co-located
prevents accidental divergence between the prompt and the pipeline branch condition.

## Existing code patterns confirmed

- `pipeline.py:581`: `if agent_id == UNROUTED_AGENT_ID or not target_arn` — model for
  the new `list_agents` branch.
- `router.py:93`: `UNROUTED_AGENT_ID` inline description — model for the new
  `list_agents` description.
- `agent_registry.get_all_cards()`: returns `Dict[str, Optional[dict]]` — the input
  to the formatter function.
- `send_slack_post_request()`: accepts `channel`, `thread_ts`, `text`, `bot_token`,
  `correlation_id`, `message_ts` — same call signature as the unrouted branch.
