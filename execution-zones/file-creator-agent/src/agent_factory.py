"""
Agent factory for Execution Agent with file generation and guidelines tools.

Creates a Strands Agent configured with Bedrock and tools:
generate_text_file, generate_excel, generate_word, generate_powerpoint,
generate_chart_image, get_business_document_guidelines, get_presentation_slide_guidelines.

Note: fetch_url was moved to the dedicated fetch-url-agent (035-fetch-url-agent).
"""

import os
from typing import Any, List

from strands import Agent
from strands.models.bedrock import BedrockModel

from system_prompt import FULL_SYSTEM_PROMPT
from tools.generate_text_file import generate_text_file
from tools.generate_excel import generate_excel
from tools.generate_word import generate_word
from tools.generate_powerpoint import generate_powerpoint
from tools.generate_chart_image import generate_chart_image
from tools.get_business_document_guidelines import get_business_document_guidelines
from tools.get_presentation_slide_guidelines import get_presentation_slide_guidelines


def get_tools() -> List[Any]:
    """Return list of @tool functions for file generation and guidelines."""
    return [
        generate_text_file,
        generate_excel,
        generate_word,
        generate_powerpoint,
        generate_chart_image,
        get_business_document_guidelines,
        get_presentation_slide_guidelines,
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
    model_id = os.environ.get(
        "BEDROCK_MODEL_ID",
        "jp.anthropic.claude-sonnet-4-5-20250929-v1:0",
    )
    region = os.environ.get("AWS_REGION_NAME", "ap-northeast-1")

    model = BedrockModel(model_id=model_id, region_name=region)

    return Agent(
        model=model,
        tools=tool_list,
        system_prompt=FULL_SYSTEM_PROMPT,
    )
