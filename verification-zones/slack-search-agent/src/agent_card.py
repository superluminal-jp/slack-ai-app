"""Agent Card for Slack Search Agent."""

import os
import time
from typing import Any, Dict


def get_agent_card() -> Dict[str, Any]:
    """Generate Agent Card JSON for Slack Search Agent."""
    runtime_url = os.environ.get("AGENTCORE_RUNTIME_URL", "http://localhost:9000")

    return {
        "name": "SlackAI-SlackSearchAgent",
        "description": (
            "Slack チャンネルのメッセージ検索、スレッド取得、チャンネル履歴取得を行うエージェント。"
            "アクセス可能範囲は呼び出し元チャンネルと公開チャンネルに限定。"
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
                "id": "search-messages",
                "name": "Search Messages",
                "description": (
                    "キーワードで Slack チャンネルのメッセージを検索する。"
                    "呼び出し元チャンネルと公開チャンネルのみ対象。"
                ),
                "inputModes": ["text"],
                "outputModes": ["text"],
            },
            {
                "id": "get-thread",
                "name": "Get Thread",
                "description": (
                    "Slack メッセージ URL からスレッド全体（親メッセージ + 返信）を取得する。"
                ),
                "inputModes": ["text"],
                "outputModes": ["text"],
            },
            {
                "id": "get-channel-history",
                "name": "Get Channel History",
                "description": (
                    "指定チャンネルの最新メッセージ履歴を取得する（最大 20 件）。"
                ),
                "inputModes": ["text"],
                "outputModes": ["text"],
            },
        ],
        "defaultInputModes": ["text"],
        "defaultOutputModes": ["text"],
    }


def get_health_status(is_busy: bool = False) -> Dict[str, Any]:
    """Generate /ping health response."""
    status = "HealthyBusy" if is_busy else "Healthy"
    return {
        "status": status,
        "agent": "SlackAI-SlackSearchAgent",
        "version": "1.0.0",
        "timestamp": time.time(),
    }
