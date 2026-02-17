"""
A2A Agent Router for Verification Agent.

Uses a Strands Agent with Bedrock (Claude Haiku 4.5) to automatically select
the appropriate Execution Agent from multiple A2A endpoints based on user query.

Routing pattern: "Agents as Tools" — each target agent is represented as a tool
that the routing agent can select. The Strands agent analyzes the user's message
and calls the appropriate tool to indicate which agent should handle the request.

References:
- Strands Agents multi-agent patterns: https://strandsagents.com/latest/documentation/docs/user-guide/concepts/multi-agent/
- AWS best practice: lightweight classifier model for routing (Claude Haiku 4.5)
"""

import os
import traceback

from strands import Agent, tool
from strands.models.bedrock import BedrockModel

from logger_util import get_logger, log

_logger = get_logger()

# Agent identifiers (used in pipeline.py to resolve ARN)
AGENT_GENERAL = "general"
AGENT_DOC_SEARCH = "doc_search"

# Default router model: Claude Haiku 4.5 (cross-region, cost-effective for classification)
_DEFAULT_ROUTER_MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0"


def _log(level: str, event_type: str, data: dict) -> None:
    """Structured JSON logging for CloudWatch."""
    log(_logger, level, event_type, data, service="verification-agent-router")


# ─── Routing tools ───
# Each tool represents a target A2A agent. The Strands router agent calls
# exactly one tool based on the user's query to indicate routing decision.


@tool
def select_doc_search_agent() -> str:
    """ドキュメント検索エージェントにルーティングします。

    このプロジェクト自体のドキュメント・仕様書・アーキテクチャ・開発者ガイド・
    デプロイ手順・README・CHANGELOG に関する質問の場合に呼び出してください。
    """
    return AGENT_DOC_SEARCH


@tool
def select_general_agent() -> str:
    """汎用AIエージェントにルーティングします。

    ファイル生成（Excel, Word, PowerPoint, Markdown, CSV, グラフ）、現在時刻取得、
    URL取得、ビジネスドキュメント/プレゼンテーション作成、翻訳、要約、
    一般的なAI質問など、ドキュメント検索以外のすべてのリクエストの場合に呼び出してください。
    """
    return AGENT_GENERAL


# ─── Router system prompt ───

ROUTER_SYSTEM_PROMPT = (
    "あなたはリクエストルーターです。ユーザーのメッセージを分析し、"
    "最も適切なエージェントを選択するツールを1つだけ呼び出してください。\n\n"
    "ルーティング基準:\n"
    "- select_doc_search_agent: このプロジェクト自体のドキュメント・仕様・"
    "アーキテクチャ・開発手順・デプロイ方法・README・CHANGELOGについて質問している場合\n"
    "- select_general_agent: それ以外すべて（ファイル生成、時刻、URL取得、"
    "一般知識、翻訳、要約、プログラミング質問等）\n\n"
    "必ずどちらか1つのツールを呼び出してください。テキストのみで回答しないでください。"
)


def _create_router_agent() -> Agent:
    """Create a lightweight Strands Agent for routing decisions.

    Uses Claude Haiku 4.5 on Bedrock for fast, cost-effective classification.
    max_tokens is kept low (256) since routing only needs a tool call + brief text.
    temperature=0.0 for deterministic routing.
    """
    model_id = os.environ.get("ROUTER_MODEL_ID", _DEFAULT_ROUTER_MODEL_ID)
    region = os.environ.get("AWS_REGION_NAME", "ap-northeast-1")

    model = BedrockModel(
        model_id=model_id,
        region_name=region,
        max_tokens=256,
        temperature=0.0,
    )

    return Agent(
        model=model,
        tools=[select_doc_search_agent, select_general_agent],
        system_prompt=ROUTER_SYSTEM_PROMPT,
    )


def _extract_routing_from_result(result) -> str:
    """Extract routing decision from Strands agent result.

    Checks the agent's response text for the routing indicator returned by the tool.
    Falls back to AGENT_GENERAL if parsing fails.
    """
    try:
        msg = result.message
        if isinstance(msg, dict):
            for block in msg.get("content", []):
                if isinstance(block, dict) and "text" in block:
                    text = block.get("text", "").lower()
                    if AGENT_DOC_SEARCH in text:
                        return AGENT_DOC_SEARCH
    except Exception:
        pass
    return AGENT_GENERAL


def route_request(text: str, correlation_id: str = "") -> str:
    """Determine which Execution Agent should handle this request.

    Uses a Strands Agent (Claude Haiku 4.5) to analyze the user's message
    and select the appropriate A2A target agent.

    Args:
        text: User's message text (used for routing classification only).
        correlation_id: Correlation ID for tracing.

    Returns:
        Agent identifier: AGENT_GENERAL or AGENT_DOC_SEARCH.
        Falls back to AGENT_GENERAL on any error (fail-open).
    """
    # Skip routing if doc search agent is not configured
    doc_search_arn = os.environ.get("DOC_SEARCH_AGENT_ARN", "")
    if not doc_search_arn:
        return AGENT_GENERAL

    if not text or not text.strip():
        return AGENT_GENERAL

    try:
        router = _create_router_agent()
        result = router(f"ルーティングしてください: {text}")
        selected = _extract_routing_from_result(result)

        _log("INFO", "routing_decision", {
            "correlation_id": correlation_id,
            "selected_agent": selected,
            "text_preview": text[:100] if text else "",
        })

        return selected

    except Exception as e:
        _log("WARN", "routing_error_fallback_general", {
            "correlation_id": correlation_id,
            "error": str(e),
            "error_type": type(e).__name__,
            "traceback": traceback.format_exc(),
        })
        # Fail-open: default to general agent
        return AGENT_GENERAL
