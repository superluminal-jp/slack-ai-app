"""
Agent Card for Doc Search Agent.

Defines the A2A protocol Agent Card (/.well-known/agent-card.json) and
health check endpoint (/ping) for the Doc Search Agent.

Reference: https://google.github.io/A2A/#/documentation?id=agent-card
"""

import os
import time
from typing import Any, Dict

from logger_util import get_logger, log

_logger = get_logger()


def _log(level: str, event_type: str, data: dict) -> None:
    """Structured JSON logging for CloudWatch."""
    log(_logger, level, event_type, data, service="doc-search-agent-card")


def get_agent_card() -> Dict[str, Any]:
    """
    Generate the Agent Card JSON for the Doc Search Agent.

    Returns:
        dict: Agent Card JSON conforming to A2A specification
    """
    runtime_url = os.environ.get("AGENTCORE_RUNTIME_URL", "http://localhost:9000")

    return {
        "name": "SlackAI-DocSearchAgent",
        "description": (
            "ドキュメント検索エージェント。プロジェクトのドキュメント（仕様書、"
            "アーキテクチャ、開発者ガイド、デプロイ手順）を検索し、"
            "質問に対する回答を生成する。URL取得にも対応。"
        ),
        "url": runtime_url,
        "version": "1.0.0",
        "protocol": "A2A",
        "protocolVersion": "1.0",
        "authentication": {
            "type": "SIGV4",
            "service": "bedrock-agentcore",
        },
        "capabilities": {
            "streaming": False,
            "asyncProcessing": False,
            "attachments": False,
        },
        "skills": [
            {
                "id": "doc-search",
                "name": "Document Search",
                "description": (
                    "プロジェクトドキュメント（docs/）のキーワード検索。"
                    "仕様書、アーキテクチャ、開発者ガイドの内容を取得。"
                ),
                "inputModes": ["text"],
                "outputModes": ["text"],
            },
            {
                "id": "url-fetch",
                "name": "URL Content Fetch",
                "description": (
                    "指定URLのWebページ内容をテキストとして取得。"
                    "外部ドキュメントやAPIレスポンスの参照に使用。"
                ),
                "inputModes": ["text"],
                "outputModes": ["text"],
            },
        ],
        "defaultInputModes": ["text"],
        "defaultOutputModes": ["text"],
    }


def get_health_status(is_busy: bool = False) -> Dict[str, Any]:
    """
    Generate health check response for /ping endpoint.

    Args:
        is_busy: Whether the agent is currently processing a task

    Returns:
        dict: Health check response with status
    """
    status = "HealthyBusy" if is_busy else "Healthy"

    return {
        "status": status,
        "agent": "SlackAI-DocSearchAgent",
        "version": "1.0.0",
        "timestamp": time.time(),
    }
