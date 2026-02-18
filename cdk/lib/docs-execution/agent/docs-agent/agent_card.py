"""Agent Card for Docs Agent."""

import os
import time
from typing import Any, Dict


def get_agent_card() -> Dict[str, Any]:
    """Generate Agent Card JSON for Docs Agent."""
    runtime_url = os.environ.get("AGENTCORE_RUNTIME_URL", "http://localhost:9000")

    return {
        "name": "SlackAI-DocsAgent",
        "description": (
            "プロジェクトドキュメント検索専用エージェント。"
            "アーキテクチャ、仕様書、デプロイ手順、開発者ガイドなどを対象に"
            "必要情報を横断検索して回答する。"
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
                "id": "search-docs",
                "name": "Project Docs Search",
                "description": (
                    "docs/ 配下の .md/.txt/.rst ファイルをキーワード検索し、"
                    "該当箇所を返す。"
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
        "agent": "SlackAI-DocsAgent",
        "version": "1.0.0",
        "timestamp": time.time(),
    }
