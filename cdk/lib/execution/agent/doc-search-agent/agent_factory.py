"""
Agent factory for Doc Search Agent.

Creates a Strands Agent configured with Bedrock and tools: search_docs, fetch_url.
"""

import os
from typing import Any, List

from strands import Agent
from strands.models.bedrock import BedrockModel

from system_prompt import FULL_SYSTEM_PROMPT
from tools.search_docs import search_docs
from tools.fetch_url import fetch_url


def get_tools() -> List[Any]:
    """Return list of @tool functions for doc search and URL fetch."""
    return [
        search_docs,
        fetch_url,
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

    return Agent(
        model=model,
        tools=tool_list,
        system_prompt=FULL_SYSTEM_PROMPT,
    )
