"""Agent Card for Time Agent."""

import os
import time
from typing import Any, Dict


def get_agent_card() -> Dict[str, Any]:
    """Generate Agent Card JSON for Time Agent."""
    runtime_url = os.environ.get("AGENTCORE_RUNTIME_URL", "http://localhost:9000")

    return {
        "name": "SlackAI-TimeAgent",
        "description": (
            "現在日時取得専用エージェント。デフォルトは日本標準時(JST)で、"
            "日本語表記・ISO 8601など複数形式とタイムゾーン指定に対応する。"
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
                "id": "current-time",
                "name": "Current Time",
                "description": (
                    "現在の日付・時刻・曜日を日本標準時(JST)で返す。"
                    "ISO 8601 形式にも対応。"
                ),
                "inputModes": ["text"],
                "outputModes": ["text"],
            }
        ],
        "defaultInputModes": ["text"],
        "defaultOutputModes": ["text"],
    }


def get_health_status(is_busy: bool = False) -> Dict[str, Any]:
    """Generate /ping health response."""
    status = "HealthyBusy" if is_busy else "Healthy"
    return {
        "status": status,
        "agent": "SlackAI-TimeAgent",
        "version": "1.0.0",
        "timestamp": time.time(),
    }
