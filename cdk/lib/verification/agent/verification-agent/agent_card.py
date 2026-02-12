"""
Agent Card for Verification Agent.

Defines the A2A protocol Agent Card (/.well-known/agent-card.json) and
health check endpoint (/ping) for the Verification Agent.

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
    log(_logger, level, event_type, data, service="verification-agent-card")


def get_agent_card() -> Dict[str, Any]:
    """
    Generate the Agent Card JSON for the Verification Agent.

    The Agent Card describes the agent's identity, capabilities, and
    supported skills. It follows the A2A Agent Card specification.

    Returns:
        dict: Agent Card JSON conforming to A2A specification
    """
    runtime_url = os.environ.get("AGENTCORE_RUNTIME_URL", "http://localhost:9000")

    return {
        "name": "SlackAI-VerificationAgent",
        "description": (
            "セキュリティ検証エージェント。Slack Event Handler Lambdaから受け取った "
            "リクエストのセキュリティ検証パイプライン(存在確認、ホワイトリスト認可、"
            "レート制限)を実行し、Execution Agentに処理を委任、結果をSlackに投稿する。"
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
                "id": "slack-request-validation",
                "name": "Slack Request Validation",
                "description": (
                    "Slackリクエストの署名検証(HMAC-SHA256)。"
                    "イベントペイロードの整合性と真正性を確認。"
                ),
                "inputModes": ["text"],
                "outputModes": ["text"],
            },
            {
                "id": "existence-check",
                "name": "Entity Existence Check",
                "description": (
                    "Slackエンティティ(チーム、ユーザー、チャンネル)の存在確認。"
                    "Slack APIを使用してリアルタイム検証。DynamoDBキャッシュ付き。"
                ),
                "inputModes": ["text"],
                "outputModes": ["text"],
            },
            {
                "id": "whitelist-authorization",
                "name": "Whitelist Authorization",
                "description": (
                    "ホワイトリストベースのアクセス制御。"
                    "チームID、ユーザーID、チャンネルIDの認可チェック。"
                ),
                "inputModes": ["text"],
                "outputModes": ["text"],
            },
            {
                "id": "rate-limiting",
                "name": "Rate Limiting",
                "description": (
                    "DDoS防止のためのレート制限。"
                    "チーム単位・ユーザー単位のリクエスト数制限。DynamoDBベース。"
                ),
                "inputModes": ["text"],
                "outputModes": ["text"],
            },
            {
                "id": "task-delegation",
                "name": "Task Delegation to Execution Agent",
                "description": (
                    "検証済みリクエストをExecution AgentへA2A通信で委任。"
                    "SigV4認証、非同期結果ポーリング対応。"
                ),
                "inputModes": ["text"],
                "outputModes": ["text"],
            },
            {
                "id": "slack-response",
                "name": "Slack Response Posting",
                "description": (
                    "AI生成レスポンスまたはエラーメッセージをSlackチャンネル/スレッドに投稿。"
                    "ユーザーフレンドリーなエラーメッセージマッピング対応。"
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
        "agent": "SlackAI-VerificationAgent",
        "version": "1.0.0",
        "timestamp": time.time(),
    }
