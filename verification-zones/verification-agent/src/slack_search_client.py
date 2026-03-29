"""
SlackSearchClient — calls Slack Search Agent via A2A (AgentCore Runtime).

Wraps invoke_execution_agent to route search requests to the dedicated
Slack Search Agent rather than the general execution agents.
The agent ARN is resolved from the S3 agent registry (agent-id: "slack-search").
"""

import json
from typing import Optional

import agent_registry
from a2a_client import invoke_execution_agent


def _extract_response_text(raw: str) -> str:
    """
    Extract response_text from invoke_execution_agent return value.

    invoke_execution_agent returns parse_jsonrpc_response(body) which yields
    json.dumps(result) for success and json.dumps({status:error,...}) for errors.
    In tests, the mock may return the full JSON-RPC envelope — handle both.
    """
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return raw

    # Full JSON-RPC envelope (e.g. test mock returns this shape)
    if "result" in data and isinstance(data["result"], dict):
        result = data["result"]
        return result.get("response_text") or _graceful_from_status(result)

    # Already-parsed result payload (production: parse_jsonrpc_response returns this)
    if "response_text" in data:
        return data["response_text"]

    # Error in full JSON-RPC envelope
    if "error" in data:
        return "検索中にエラーが発生しました。"

    # Error payload from parse_jsonrpc_response
    if data.get("status") == "error":
        return "検索中にエラーが発生しました。"

    return raw


def _graceful_from_status(result: dict) -> str:
    """Return graceful message for non-success status payloads."""
    if result.get("status") == "error":
        return "検索中にエラーが発生しました。"
    return str(result)


class SlackSearchClient:
    """
    Client for the Slack Search Agent (verification-zone A2A).

    Uses the S3 agent registry to locate the AgentCore Runtime ARN.
    Raises ValueError if the ARN is not found in the registry.
    """

    def search(
        self,
        text: str,
        channel: str,
        bot_token: str,
        thread_ts: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> str:
        """
        Invoke the Slack Search Agent via A2A and return the response text.

        Args:
            text: Natural language search instruction or query.
            channel: Slack channel ID that originated the request.
            bot_token: Slack bot token for API access.
            thread_ts: Optional thread timestamp to scope the response.
            correlation_id: Optional trace ID for end-to-end logging.

        Returns:
            Response text string from the Slack Search Agent.

        Raises:
            ValueError: If slack-search agent is not found in the registry.
        """
        agent_arn = agent_registry.get_agent_arn("slack-search")
        if not agent_arn:
            raise ValueError(
                "slack-search agent not found in agent registry. "
                "Ensure the Slack Search Agent is registered in S3."
            )

        payload: dict = {
            "text": text,
            "channel": channel,
            "bot_token": bot_token,
        }
        if thread_ts is not None:
            payload["thread_ts"] = thread_ts
        if correlation_id is not None:
            payload["correlation_id"] = correlation_id

        raw = invoke_execution_agent(payload, agent_arn)
        return _extract_response_text(raw)
