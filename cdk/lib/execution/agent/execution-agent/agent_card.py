"""
Agent Card for Execution Agent.

Defines the A2A protocol Agent Card (/.well-known/agent-card.json) and
health check endpoint (/ping) for the Execution Agent.

The Agent Card provides metadata about the agent's capabilities,
skills, and contact information for Agent Discovery.

Reference: https://google.github.io/A2A/#/documentation?id=agent-card
"""

import json
import os
import time
from typing import Any, Dict


def _log(level: str, event_type: str, data: dict) -> None:
    """Structured JSON logging for CloudWatch."""
    log_entry = {
        "level": level,
        "event_type": event_type,
        "service": "execution-agent-card",
        "timestamp": time.time(),
        **data,
    }
    print(json.dumps(log_entry, default=str))


def get_agent_card() -> Dict[str, Any]:
    """
    Generate the Agent Card JSON for the Execution Agent.

    The Agent Card describes the agent's identity, capabilities, and
    supported skills. It follows the A2A Agent Card specification.

    Returns:
        dict: Agent Card JSON conforming to A2A specification
    """
    runtime_url = os.environ.get("AGENTCORE_RUNTIME_URL", "http://localhost:9000")

    return {
        "name": "SlackAI-ExecutionAgent",
        "description": (
            "AI処理エージェント。Verification Agentから受け取ったメッセージを "
            "Amazon Bedrock (Converse API)で処理し、AI生成レスポンスを返却する。"
            "添付ファイル処理、スレッド履歴管理、非同期タスク管理をサポート。"
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
            "attachments": True,
        },
        "skills": [
            {
                "id": "bedrock-conversation",
                "name": "Bedrock Conversation",
                "description": (
                    "Amazon Bedrock Converse APIを使用したAI会話処理。"
                    "テキストメッセージを受け取り、AIレスポンスを生成。"
                ),
                "inputModes": ["text"],
                "outputModes": ["text"],
            },
            {
                "id": "attachment-processing",
                "name": "Attachment Processing",
                "description": (
                    "Slack添付ファイルのダウンロードと処理。"
                    "画像(PNG, JPEG, GIF, WebP)とドキュメント(PDF, DOCX, CSV, XLSX, PPTX, TXT)をサポート。"
                ),
                "inputModes": ["image", "document"],
                "outputModes": ["text"],
            },
            {
                "id": "thread-history",
                "name": "Thread History Management",
                "description": (
                    "Slackスレッドの会話履歴管理。"
                    "スレッド内の過去メッセージをコンテキストとして活用。"
                ),
                "inputModes": ["text"],
                "outputModes": ["text"],
            },
            {
                "id": "async-processing",
                "name": "Async Task Processing",
                "description": (
                    "AgentCore非同期タスク管理。"
                    "長時間実行タスク(添付ファイル付きBedrock処理)をバックグラウンドで実行。"
                ),
                "inputModes": ["text"],
                "outputModes": ["text"],
            },
            {
                "id": "generated-file",
                "name": "Generated File",
                "description": (
                    "AI生成ファイルのA2A artifact返却(014)。"
                    "CSV/JSON/テキスト等をgenerated_file artifactで返し、VerificationがSlackスレッドに投稿。"
                    "最大5MB、許可MIME: text/csv, application/json, text/plain。"
                ),
                "inputModes": ["text"],
                "outputModes": ["text", "file"],
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
        "agent": "SlackAI-ExecutionAgent",
        "version": "1.0.0",
        "timestamp": time.time(),
    }
