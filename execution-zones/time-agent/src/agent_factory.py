"""
Agent factory for Time Agent.

Creates a Strands Agent configured with Bedrock and a single tool: get_current_time.
"""

import os
from typing import Any, List

from strands import Agent
from strands.models.bedrock import BedrockModel

from system_prompt import FULL_SYSTEM_PROMPT
from tools.get_current_time import get_current_time


def get_tools() -> List[Any]:
    """Return list of @tool functions for current time retrieval only."""
    return [get_current_time]


def create_agent(tools: List[Any] | None = None) -> Agent:
    """
    Create Strands Agent with optional tools.

    Args:
        tools: List of @tool functions. If None, uses get_tools().

    Returns:
        Configured Strands Agent ready for invocation.
    """
    tool_list = tools if tools is not None else get_tools()
    model_id = os.environ.get("BEDROCK_MODEL_ID", "jp.anthropic.claude-sonnet-4-6")
    region = os.environ.get("AWS_REGION_NAME", "ap-northeast-1")

    model = BedrockModel(model_id=model_id, region_name=region)

    return Agent(
        model=model,
        tools=tool_list,
        system_prompt=FULL_SYSTEM_PROMPT,
    )
