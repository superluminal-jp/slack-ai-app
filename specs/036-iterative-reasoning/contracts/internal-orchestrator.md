# Internal Contract: Orchestration Agent Interface

**Feature**: `036-iterative-reasoning` | **Date**: 2026-02-21
**Scope**: Internal to verification-agent zone. No new external A2A endpoints are introduced.

---

## Overview

The orchestration agent is an internal component of the verification agent. It replaces the `route_request()` + `invoke_execution_agent()` section of `pipeline.py`. External contracts (A2A JSON-RPC with the agent-invoker Lambda, and with execution agents) are **unchanged**.

---

## 1. Orchestrator Input Contract

```python
# Function signature (new internal API in pipeline.py)
def run_orchestration_loop(
    request: OrchestrationRequest,
    agent_registry: AgentRegistry,
    bedrock_model: BedrockModel,
) -> OrchestrationResult:
    ...
```

**OrchestrationRequest fields** (see data-model.md):
- `user_text`: str — enriched Slack text (URLs resolved, thread context prepended)
- `thread_context`: str | None
- `file_references`: list[S3FileRef]
- `available_agents`: dict[str, AgentCard]
- `correlation_id`: str
- `max_turns`: int

---

## 2. Per-Agent Tool Contract

Each registered execution agent is exposed as a Strands `@tool`. The docstring is the capability contract visible to the LLM.

```python
@tool(name="invoke_{agent_id}", description="{agent_card.description}\nSkills: {skills}")
async def invoke_{agent_id}(task: str) -> str:
    """
    {agent_card.description}

    Skills available:
    {formatted_skills}

    Args:
        task: A self-contained task description including all necessary context.
              Do not assume the agent has access to prior conversation history.

    Returns:
        The agent's response text, or an error message prefixed with "ERROR:".
    """
```

**Tool naming convention**: `invoke_` + agent_id with hyphens replaced by underscores.
Examples: `invoke_docs_agent`, `invoke_time_agent`, `invoke_execution_agent`, `invoke_fetch_url_agent`

**Error return format**: On A2A failure, the tool returns `"ERROR: {error_code} — {user_message}"` rather than raising an exception. This allows the LLM to reason about the failure and retry or work around it.

---

## 3. MCP Tool Contracts

### AWS Knowledge MCP (HTTP, SigV4)

**Endpoint**: `https://knowledge-mcp.global.api.aws/mcp`
**Auth**: AWS SigV4 (IAM role of the verification agent container)
**Tools exposed** (subset filtered for relevance):
- `aws___search_documentation(search_phrase, topics)` — search AWS documentation
- `aws___read_documentation(url)` — fetch a specific AWS documentation page
- `aws___recommend(url)` — find related documentation

### Strands Agents MCP (stdio via uvx)

**Command**: `uvx awslabs.strands-agents-mcp-server@latest`
**Tools exposed**:
- `search_docs(query)` — search Strands Agents documentation
- `fetch_doc(uri)` — fetch a specific Strands Agents documentation page

---

## 4. Orchestrator Output Contract

```python
@dataclass
class OrchestrationResult:
    synthesized_text: str          # Final answer for Slack delivery
    turns_used: int                # Actual loop turns consumed
    agents_called: list[str]       # Distinct agent_ids invoked
    file_artifact: FileArtifact | None  # If any agent produced a file
    completion_status: Literal["complete", "partial", "error"]
```

**Pipeline consumption**: `pipeline.py` receives `OrchestrationResult` and routes it through the existing response handling (Slack message formatting → SQS enqueue). The `completion_status == "partial"` case appends a note to the Slack message: _"(一部のタスクは制限により完了できませんでした)"_.

---

## 5. No Changes to External Contracts

| Contract | Status |
|---|---|
| Agent-invoker Lambda → Verification Agent (A2A JSON-RPC) | **Unchanged** |
| Verification Agent → Execution Agents (A2A JSON-RPC) | **Unchanged** — tool wrappers call the same `invoke_execution_agent()` function |
| Verification Agent → SQS (Slack post request) | **Unchanged** |
| Verification Agent `POST /` endpoint schema | **Unchanged** |
| Verification Agent `/.well-known/agent-card.json` | **Unchanged** |
