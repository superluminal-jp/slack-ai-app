"""Dynamic tool generation for execution agents used by OrchestrationAgent."""
import asyncio
import inspect
import json

try:
    from strands import tool
except ImportError:  # pragma: no cover
    def tool(func):
        return func

from a2a_client import invoke_execution_agent
from agent_registry import get_agent_arn
from logger_util import get_logger, log

_logger = get_logger()


def _log(level, event_type, data):
    log(_logger, level, event_type, data, service="verification-agent")


def make_agent_tool(agent_id: str, card: dict, slack_context: dict | None = None):
    """Create a Strands @tool for a single registered execution agent.

    Args:
        agent_id: The execution agent ID.
        card: Agent card dict (from agent registry).
        slack_context: Slack fields required by execution agents
            (channel, bot_token, thread_ts, correlation_id).
    """
    _slack_ctx = slack_context or {}
    safe_name = "invoke_" + agent_id.replace("-", "_")
    description = card.get("description", f"Execute task using {agent_id}")
    skills = card.get("skills", [])
    skill_names = [s.get("name", "") for s in skills if isinstance(s, dict)]
    if skill_names:
        description += f"\nSkills available: {', '.join(skill_names)}"
    description += (
        "\n\nArgs:\n    task: A self-contained task description including all necessary context."
        " Do not assume the agent has access to prior conversation history.\n"
        "Returns:\n    The agent's response text, or an error message prefixed with 'ERROR:'."
    )

    # Build async tool function dynamically
    async def _invoke(task: str) -> str:
        target_arn = get_agent_arn(agent_id)
        if not target_arn:
            return f"ERROR: agent_not_found — No ARN found for agent '{agent_id}'"
        payload = {
            "text": task,
            "channel": _slack_ctx.get("channel", ""),
            "bot_token": _slack_ctx.get("bot_token", ""),
            "thread_ts": _slack_ctx.get("thread_ts"),
            "correlation_id": _slack_ctx.get("correlation_id", ""),
        }
        try:
            raw = await asyncio.to_thread(
                invoke_execution_agent,
                payload,
                target_arn,
            )
            # invoke_execution_agent returns JSON; extract plain response_text for the LLM
            try:
                parsed = json.loads(raw)
                if parsed.get("status") == "error":
                    code = parsed.get("error_code", "invocation_failed")
                    msg = parsed.get("error_message", str(parsed))
                    return f"ERROR: {code} — {msg}"
                return parsed.get("response_text", raw)
            except (json.JSONDecodeError, AttributeError):
                return raw
        except Exception as e:
            _log("WARN", "agent_tool_error", {
                "agent_id": agent_id,
                "error": str(e),
                "error_type": type(e).__name__,
            })
            return f"ERROR: invocation_failed — {str(e)}"

    # Set name and docstring on the inner function before applying @tool
    _invoke.__name__ = safe_name
    _invoke.__qualname__ = safe_name
    _invoke.__doc__ = description

    # Apply @tool decorator
    return tool(_invoke)


def build_agent_tools(registry: dict, slack_context: dict | None = None) -> list:
    """Generate one @tool per registered execution agent from the registry.

    Args:
        registry: dict mapping agent_id -> agent_card dict
        slack_context: Slack fields (channel, bot_token, thread_ts, correlation_id)
            forwarded to every execution agent invocation.

    Returns:
        List of Strands tool-decorated async functions.
    """
    tools = []
    for agent_id, card in registry.items():
        if not isinstance(card, dict):
            continue
        try:
            agent_tool = make_agent_tool(agent_id, card, slack_context=slack_context)
            tools.append(agent_tool)
        except Exception as e:
            _log("WARN", "agent_tool_creation_failed", {
                "agent_id": agent_id,
                "error": str(e),
            })
    return tools
