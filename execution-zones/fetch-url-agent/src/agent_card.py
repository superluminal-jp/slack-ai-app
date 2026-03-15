"""
Agent Card for Web Fetch Agent.

Defines the A2A protocol Agent Card (/.well-known/agent-card.json) and
health check endpoint (/ping) for the Web Fetch Agent.

The Agent Card provides metadata about the agent's capabilities,
skills, and contact information for Agent Discovery.

Reference: https://google.github.io/A2A/#/documentation?id=agent-card
"""

import json
import os
import time
from typing import Any, Dict

from logger_util import get_logger, log

_logger = get_logger()


def _log(level: str, event_type: str, data: dict) -> None:
    """Structured JSON logging for CloudWatch."""
    log(_logger, level, event_type, data, service="web-fetch-agent-card")


def get_agent_card() -> Dict[str, Any]:
    """
    Generate the Agent Card JSON for the Web Fetch Agent.

    The Agent Card describes the agent's identity, capabilities, and
    supported skills. It follows the A2A Agent Card specification.

    Returns:
        dict: Agent Card JSON conforming to A2A specification
    """
    runtime_url = os.environ.get("AGENTCORE_RUNTIME_URL", "http://localhost:9000")

    return {
        "name": "SlackAI-WebFetchAgent",
        "description": (
            "指定URLのWebコンテンツをテキストとして取得する専用エージェント。"
            "SSRF防止（プライベートIP・内部ネットワークブロック）、"
            "512KBサイズ制限、10秒タイムアウトを備える。"
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
            "asyncProcessing": True,
            "attachments": False,
        },
        "skills": [
            {
                "id": "fetch_url",
                "name": "Fetch URL",
                "description": (
                    "指定URLのWebコンテンツをテキストとして取得する。"
                    "SSRFセキュリティ対策済み。HTMLはテキスト抽出して返す。"
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
        "agent": "SlackAI-WebFetchAgent",
        "version": "1.0.0",
        "timestamp": time.time(),
    }
