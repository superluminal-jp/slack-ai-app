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

from logger_util import get_logger, log

_logger = get_logger()


def _log(level: str, event_type: str, data: dict) -> None:
    """Structured JSON logging for CloudWatch."""
    log(_logger, level, event_type, data, service="execution-agent-card")


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
        "name": "SlackAI-FileCreatorAgent",
        "description": (
            "ファイル生成特化エージェント。Excel/Word/PowerPoint/CSV/チャート画像などの"
            "業務ファイルを生成し、ビジネス文書・スライド作成ガイドラインを参照する。"
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
                "id": "generate_excel",
                "name": "Generate Excel",
                "description": (
                    "構造化データをExcel(.xlsx)形式で生成する。"
                ),
                "inputModes": ["text"],
                "outputModes": ["text", "file"],
            },
            {
                "id": "generate_word",
                "name": "Generate Word",
                "description": (
                    "提案書・報告書などのWord(.docx)文書を生成する。"
                ),
                "inputModes": ["text"],
                "outputModes": ["text", "file"],
            },
            {
                "id": "generate_powerpoint",
                "name": "Generate PowerPoint",
                "description": (
                    "プレゼンテーション資料をPowerPoint(.pptx)形式で生成する。"
                ),
                "inputModes": ["text"],
                "outputModes": ["text", "file"],
            },
            {
                "id": "generate_chart_image",
                "name": "Generate Chart Image",
                "description": (
                    "データからチャート画像を生成する。"
                ),
                "inputModes": ["text"],
                "outputModes": ["text", "file"],
            },
            {
                "id": "generate_text_file",
                "name": "Generate Text File",
                "description": (
                    "CSV/JSON/TXTなどのテキスト系ファイルを生成する。"
                ),
                "inputModes": ["text"],
                "outputModes": ["text", "file"],
            },
            {
                "id": "get_business_document_guidelines",
                "name": "Business Document Guidelines",
                "description": (
                    "ビジネス文書作成の標準ガイドラインを返す。"
                ),
                "inputModes": ["text"],
                "outputModes": ["text"],
            },
            {
                "id": "get_presentation_slide_guidelines",
                "name": "Presentation Slide Guidelines",
                "description": (
                    "プレゼン資料作成の標準ガイドラインを返す。"
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
        "agent": "SlackAI-FileCreatorAgent",
        "version": "1.0.0",
        "timestamp": time.time(),
    }
