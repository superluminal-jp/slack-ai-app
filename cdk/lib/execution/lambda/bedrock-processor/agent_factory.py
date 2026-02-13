"""
Agent factory for Execution Agent with file generation tools (027).

Creates a Strands Agent configured with Bedrock and file generation tools:
generate_text_file, generate_excel, generate_word, generate_powerpoint, generate_chart_image.
"""

import os
from typing import Any, List

from strands import Agent
from strands.models.bedrock import BedrockModel

from tools.generate_text_file import generate_text_file
from tools.generate_excel import generate_excel
from tools.generate_word import generate_word
from tools.generate_powerpoint import generate_powerpoint
from tools.generate_chart_image import generate_chart_image


def get_tools() -> List[Any]:
    """Return list of @tool functions for file generation."""
    return [
        generate_text_file,
        generate_excel,
        generate_word,
        generate_powerpoint,
        generate_chart_image,
    ]


def create_agent(tools: List[Any] | None = None) -> Agent:
    """
    Create Strands Agent with optional tools.

    Args:
        tools: List of @tool functions. If None, uses get_tools().

    Returns:
        Configured Strands Agent ready for invocation.
    """
    tool_list = tools if tools is not None else get_tools()
    model_id = os.environ.get("BEDROCK_MODEL_ID", "amazon.nova-pro-v1:0")
    region = os.environ.get("AWS_REGION_NAME", "ap-northeast-1")

    model = BedrockModel(model_id=model_id, region_name=region)

    system_prompt = (
        "You are a helpful AI assistant. When the user asks you to create a file, you MUST call "
        "the appropriate tool to generate the actual file. Do NOT respond with only a text description "
        "of what the file would contain — the user will receive nothing if you do not call the tool.\n\n"
        "Tools: generate_text_file (Markdown, CSV, plain text), generate_excel (Excel .xlsx), "
        "generate_word (Word .docx), generate_powerpoint (PowerPoint .pptx), "
        "generate_chart_image (bar/line/pie/scatter charts as PNG).\n\n"
        "Rules: (1) Always invoke the tool with concrete data (e.g., for Excel: sheets with headers "
        "and rows). (2) Keep your text response brief (e.g., 'Excelファイルを作成しました。'). "
        "(3) The file is uploaded to Slack automatically as an attachment; do not describe file "
        "contents in detail — the user will see the file."
    )

    return Agent(
        model=model,
        tools=tool_list,
        system_prompt=system_prompt,
    )
