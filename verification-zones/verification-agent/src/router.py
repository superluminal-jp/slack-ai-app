"""Router Agent for selecting target execution runtime."""

import os
from typing import Dict, Optional, Set

from agent_registry import (
    DEFAULT_AGENT_ID,
    get_agent_arn,
    get_agent_ids,
    get_all_cards,
    is_multi_agent,
    refresh_missing_cards,
)
from logger_util import get_logger, log

try:
    from strands import Agent, tool
    from strands.models.bedrock import BedrockModel
except ImportError:  # pragma: no cover
    Agent = None
    BedrockModel = None

    def tool(func):
        return func


_logger = get_logger()
_ROUTER_MODEL_ID = os.environ.get(
    "ROUTER_MODEL_ID", "anthropic.claude-sonnet-4-6-20260219-v1:0"
)
UNROUTED_AGENT_ID = "unrouted"
TIME_AGENT_ID = "time"
_TIME_QUERY_KEYWORDS = (
    "現在時刻",
    "今の時刻",
    "現在の時刻",
    "時刻を取得",
    "時間を取得",
    "何時",
    "what time",
    "current time",
    "time now",
)


def _log(level: str, event_type: str, data: dict) -> None:
    """Structured JSON logging for CloudWatch."""
    log(_logger, level, event_type, data, service="verification-agent-router")


def _build_agent_summary(agent_id: str, card: Optional[dict]) -> str:
    """Build a compact, card-based summary for one routing option."""
    if not isinstance(card, dict):
        return f"- {agent_id}: No agent card metadata available."

    name = str(card.get("name", "")).strip()
    description = str(card.get("description", "")).strip()
    capabilities = card.get("capabilities", {})
    skills = card.get("skills", [])

    capability_parts = []
    if isinstance(capabilities, dict):
        for key in ("attachments", "asyncProcessing", "streaming"):
            if capabilities.get(key) is True:
                capability_parts.append(key)

    skill_parts = []
    if isinstance(skills, list):
        for skill in skills[:3]:
            if isinstance(skill, dict):
                skill_name = str(skill.get("name", "")).strip()
                skill_desc = str(skill.get("description", "")).strip()
                if skill_name and skill_desc:
                    skill_parts.append(f"{skill_name}: {skill_desc}")
                elif skill_name:
                    skill_parts.append(skill_name)

    details = []
    if name:
        details.append(f"name={name}")
    if description:
        details.append(f"description={description}")
    if capability_parts:
        details.append(f"capabilities={', '.join(capability_parts)}")
    if skill_parts:
        details.append(f"skills={'; '.join(skill_parts)}")

    if not details:
        return f"- {agent_id}: Agent card present but metadata is empty."
    return f"- {agent_id}: " + " | ".join(details)


def _build_router_system_prompt(
    available_agent_ids: Set[str],
    agent_cards: Dict[str, Optional[dict]],
) -> str:
    """Create routing system prompt from execution-agent-provided metadata only."""
    lines = [
        "You are a routing controller for multiple execution agents.",
        "Choose exactly one target agent based on the request text and the agent card metadata below.",
        "Do not assume hidden policies. Use only the provided request and agent metadata.",
        "",
        "Available routing options:",
    ]
    for agent_id in sorted(available_agent_ids):
        lines.append(_build_agent_summary(agent_id, agent_cards.get(agent_id)))
    lines.append("")
    if DEFAULT_AGENT_ID in available_agent_ids:
        lines.extend([
            "Routing rules:",
            f"- If the request clearly matches a specialized agent's description or skills, select that agent.",
            f"- For ambiguous, general-purpose, or conversational requests (greetings, meta-questions about available tools, etc.), select '{DEFAULT_AGENT_ID}'.",
            f"- When in doubt, default to '{DEFAULT_AGENT_ID}'. Never leave a request unrouted.",
        ])
    lines.append("")
    lines.append("You MUST call select_agent exactly once with one of the available agent ids listed above.")
    return "\\n".join(lines)


def _route_with_router_model(
    text: str,
    correlation_id: str,
    available_agent_ids: Set[str],
    agent_cards: Dict[str, Optional[dict]],
) -> str:
    """Run router model + tool call to select target agent id."""
    if Agent is None or BedrockModel is None:
        raise RuntimeError("strands router dependencies unavailable")

    selected = {"agent_id": UNROUTED_AGENT_ID}

    @tool
    def select_agent(agent_id: str) -> str:
        """Select the target execution agent for routing.

        Args:
            agent_id: The id of the agent to route to. Must be one of the available agent ids.
        """
        value = (agent_id or UNROUTED_AGENT_ID).strip().lower()
        selected["agent_id"] = value
        return value

    model = BedrockModel(
        model_id=_ROUTER_MODEL_ID,
        region_name=os.environ.get("AWS_REGION_NAME", "ap-northeast-1"),
    )
    prompt = _build_router_system_prompt(available_agent_ids, agent_cards)
    agent = Agent(model=model, tools=[select_agent], system_prompt=prompt)
    available_ids_csv = ", ".join(sorted(available_agent_ids))
    agent(
        f"Available agent ids in this environment: {available_ids_csv}.\\n"
        "Route this user request by calling select_agent with one available id.\\n"
        f"Request text: {text}"
    )

    chosen = selected.get("agent_id", UNROUTED_AGENT_ID)
    if chosen in available_agent_ids:
        return chosen
    # Fallback to file-creator if router model returned invalid id
    if DEFAULT_AGENT_ID in available_agent_ids:
        return DEFAULT_AGENT_ID
    return UNROUTED_AGENT_ID


def _route_with_heuristics(text: str, available_agent_ids: Set[str]) -> str:
    """Fast-path deterministic routes for high-confidence intents."""
    normalized = (text or "").strip().lower()
    if TIME_AGENT_ID in available_agent_ids:
        if any(keyword in normalized for keyword in _TIME_QUERY_KEYWORDS):
            return TIME_AGENT_ID
    return ""


def route_request(text: str, correlation_id: str = "") -> str:
    """
    Route a request to an execution agent id.

    Fail-safe behavior:
    - single-agent mode -> configured agent id
    - empty/invalid/router errors -> unrouted (do not invoke any agent)
    """
    configured_ids = set(get_agent_ids())
    available_agent_ids: Set[str] = configured_ids

    if not available_agent_ids:
        _log("INFO", "router_decision", {
            "correlation_id": correlation_id,
            "selected_agent_id": UNROUTED_AGENT_ID,
            "fallback_reason": "no_configured_agents",
        })
        return UNROUTED_AGENT_ID

    if not is_multi_agent():
        selected_agent_id = DEFAULT_AGENT_ID if DEFAULT_AGENT_ID in available_agent_ids else sorted(available_agent_ids)[0]
        _log("INFO", "router_decision", {
            "correlation_id": correlation_id,
            "selected_agent_id": selected_agent_id,
            "fallback_reason": "single_agent_mode",
        })
        return selected_agent_id

    if not text or not text.strip():
        _log("INFO", "router_decision", {
            "correlation_id": correlation_id,
            "selected_agent_id": UNROUTED_AGENT_ID,
            "fallback_reason": "empty_text",
        })
        return UNROUTED_AGENT_ID

    heuristic_agent_id = _route_with_heuristics(text, available_agent_ids)
    if heuristic_agent_id:
        selected_agent_id = heuristic_agent_id
        fallback_reason = "heuristic_time_match"
        if not get_agent_arn(heuristic_agent_id):
            if DEFAULT_AGENT_ID in available_agent_ids and get_agent_arn(DEFAULT_AGENT_ID):
                selected_agent_id = DEFAULT_AGENT_ID
                fallback_reason = "heuristic_missing_agent_arn_fallback_default"
            else:
                selected_agent_id = UNROUTED_AGENT_ID
                fallback_reason = "heuristic_missing_agent_arn"
        _log("INFO", "router_decision", {
            "correlation_id": correlation_id,
            "requested_agent_id": heuristic_agent_id,
            "selected_agent_id": selected_agent_id,
            "fallback_reason": fallback_reason,
        })
        return selected_agent_id

    refresh_missing_cards()
    agent_cards = get_all_cards()

    try:
        _log("INFO", "router_agent_inventory", {
            "correlation_id": correlation_id,
            "available_agent_ids": sorted(available_agent_ids),
            "agent_card_ids": sorted(agent_cards.keys()),
        })
        agent_id = _route_with_router_model(
            text=text,
            correlation_id=correlation_id,
            available_agent_ids=available_agent_ids,
            agent_cards=agent_cards,
        )
        selected_agent_id = agent_id
        fallback_reason = ""
        if agent_id not in available_agent_ids:
            if DEFAULT_AGENT_ID in available_agent_ids and get_agent_arn(DEFAULT_AGENT_ID):
                selected_agent_id = DEFAULT_AGENT_ID
                fallback_reason = "invalid_agent_id_fallback_default"
            else:
                selected_agent_id = UNROUTED_AGENT_ID
                fallback_reason = "invalid_agent_id"
        elif not get_agent_arn(agent_id):
            if DEFAULT_AGENT_ID in available_agent_ids and get_agent_arn(DEFAULT_AGENT_ID):
                selected_agent_id = DEFAULT_AGENT_ID
                fallback_reason = "missing_agent_arn_fallback_default"
            else:
                selected_agent_id = UNROUTED_AGENT_ID
                fallback_reason = "missing_agent_arn"

        _log("INFO", "router_decision", {
            "correlation_id": correlation_id,
            "requested_agent_id": agent_id,
            "selected_agent_id": selected_agent_id,
            "fallback_reason": fallback_reason,
        })
        return selected_agent_id
    except Exception as e:
        # Fallback to file-creator on router exceptions when available
        fallback_id = UNROUTED_AGENT_ID
        fallback_reason = "router_exception"
        if DEFAULT_AGENT_ID in available_agent_ids and get_agent_arn(DEFAULT_AGENT_ID):
            fallback_id = DEFAULT_AGENT_ID
            fallback_reason = "router_exception_fallback_default"
        _log("WARN", "router_fallback_default", {
            "correlation_id": correlation_id,
            "error": str(e),
            "error_type": type(e).__name__,
        })
        _log("INFO", "router_decision", {
            "correlation_id": correlation_id,
            "selected_agent_id": fallback_id,
            "fallback_reason": fallback_reason,
        })
        return fallback_id
