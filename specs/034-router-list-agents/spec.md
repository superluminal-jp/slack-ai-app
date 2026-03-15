# Feature Specification: Agent List via Slack Reply

**Feature Branch**: `034-router-list-agents`
**Created**: 2026-02-20
**Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Discover Available Agents (Priority: P1)

A Slack user wants to know what AI capabilities the bot offers before formulating a request.
They send a natural-language question such as "何ができますか？" or "エージェント一覧を教えて"
and receive a reply in the same thread listing every registered agent with its name,
description, and skills.

**Why this priority**: Without discoverability, users cannot self-serve and must rely on
documentation or trial-and-error to learn what the bot supports. This is the core value
of the feature.

**Independent Test**: Ask the bot "使えるエージェントを教えて" in a Slack channel and
confirm the reply contains each registered agent's name and a brief description.

**Acceptance Scenarios**:

1. **Given** the bot has multiple registered agents, **When** a user sends a message
   expressing intent to see available agents (e.g., "何ができる？", "agent list",
   "利用可能なエージェント一覧"), **Then** the bot replies in the same thread with a
   formatted list showing each agent's name, description, and skills.

2. **Given** the bot has agents registered, **When** the user's intent is ambiguous but
   clearly not a task for any specific agent, **Then** the routing system selects
   `list_agents` only when the intent is specifically about discovering capabilities —
   not for general chitchat or unrelated queries.

3. **Given** one or more agents failed agent-card discovery at startup, **When** the
   user requests the agent list, **Then** the reply includes all agents whose cards are
   available and omits agents with no card data (no error shown to the user).

---

### User Story 2 — Handle No Registered Agents (Priority: P2)

The bot is running but no execution agents are configured. A user asks for the agent list
and receives a graceful reply indicating that no agents are currently available.

**Why this priority**: This prevents a blank or confusing reply when the agent registry
is empty, which can happen during initial deployment or misconfiguration.

**Independent Test**: Remove all agent ARNs from configuration, restart the bot, ask
"何ができる？", and confirm the reply clearly states that no agents are registered.

**Acceptance Scenarios**:

1. **Given** no agents are registered, **When** a user requests the agent list, **Then**
   the bot replies with a clear message stating that no agents are currently available
   rather than an empty list or error.

---

### Edge Cases

- What happens when the user sends a list request inside a thread? → Reply is posted
  in that thread (same behavior as all other responses).
- What happens when the routing LLM selects `list_agents` but the agent_cards are all
  `None`? → User Story 2 behavior: graceful "no agents available" message.
- What happens when the message matches `list_agents` intent but also contains a
  task (e.g., "What can you do? Also create an Excel file")? → Router must choose one
  route; if task intent is stronger, the task agent is selected over `list_agents`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The routing system MUST recognize user intent to discover available agents
  and return a dedicated `list_agents` route — using natural-language understanding,
  not keyword matching.
- **FR-002**: When the `list_agents` route is selected, the system MUST compile the
  names, descriptions, and skills of all agents whose cards are available in the registry.
- **FR-003**: The system MUST post the agent list as a Slack reply in the originating
  thread, formatted for readability.
- **FR-004**: If no agents have available card data, the system MUST reply with a
  user-friendly message indicating that no agents are currently configured.
- **FR-005**: The `list_agents` route MUST pass through all standard security checks
  (existence check, whitelist authorization, rate limiting) before the list is compiled
  and sent.
- **FR-006**: The system MUST log the routing decision to `list_agents` with a
  correlation ID, consistent with existing routing log events.

### Key Entities

- **Agent Card**: Metadata describing one registered agent — includes name, description,
  and a list of skills (each skill has a name and description).
- **Agent Registry**: The in-memory collection of all registered agent cards, populated
  at system startup and refreshed for missing entries before each routing decision.
- **list_agents route**: A special routing outcome (alongside `unrouted` and agent IDs)
  that signals the system to reply with the agent list instead of delegating to an
  execution agent.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user asking "何ができる？" or equivalent receives a Slack reply listing
  all registered agents within the same response time as a standard routed request.
- **SC-002**: The agent list reply contains the correct number of agents (matching the
  registry) — verified in unit tests against a mock registry.
- **SC-003**: The `list_agents` route is selected for intent-to-discover messages and
  NOT selected for unrelated messages — validated by a test suite covering at least
  5 positive and 5 negative routing examples.
- **SC-004**: When no agents are registered, the reply is non-empty and communicates
  absence clearly — no blank messages, no stack traces visible to the user.

## Assumptions

- Agent card data (name, description, skills) is already fetched and cached in the
  registry at startup; this feature reads from the cache and does not trigger additional
  network calls.
- The Slack message format is plain text with Slack mrkdwn markup (bold, bullets) —
  Block Kit is out of scope for this feature.
- The routing LLM prompt already describes all available route IDs; `list_agents` is
  added as one more option with a clear description.
- The feature does not require re-fetching or refreshing agent cards at list-request
  time; staleness is acceptable because cards are refreshed at startup and on missing
  entries by the existing `refresh_missing_cards()` call.
