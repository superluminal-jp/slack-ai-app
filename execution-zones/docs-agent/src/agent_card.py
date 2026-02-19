"""Agent Card for Docs Agent."""

import os
import time
from typing import Any, Dict


def get_agent_card() -> Dict[str, Any]:
    """Generate Agent Card JSON for Docs Agent."""
    runtime_url = os.environ.get("AGENTCORE_RUNTIME_URL", "http://localhost:9000")

    return {
        "name": "SlackAI-DocsAgent (Slack AI App)",
        "description": (
            "Slack AI App（SlackからAIを呼び出す本システム）向けの"
            "プロジェクトドキュメント検索エージェント。"
            "Slack上の質問に対して、アーキテクチャ・仕様書・デプロイ手順・"
            "開発者ガイドなどを横断検索して回答する。"
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
                "name": "Slack AI App Project Docs Search",
                "description": (
                    "Slack AI App プロジェクトの docs/ 配下にある"
                    ".md/.txt/.rst ファイルをキーワード検索し、"
                    "Slackでの問い合わせに対応する根拠箇所を返す。"
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
        "agent": "SlackAI-DocsAgent (Slack AI App)",
        "version": "1.0.0",
        "timestamp": time.time(),
    }
