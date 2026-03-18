"""
Tests for agent_tools.build_agent_tools().

TDD: these tests are written before the implementation exists.
"""

import asyncio
import inspect
import sys
from unittest.mock import MagicMock, patch

import pytest

# ── Fixtures ──────────────────────────────────────────────────────────────────

SAMPLE_REGISTRY = {
    "docs-agent": {
        "name": "Docs Agent",
        "description": "Retrieves documentation and answers technical questions.",
        "skills": [{"name": "search_docs"}, {"name": "fetch_page"}],
    },
    "time-agent": {
        "name": "Time Agent",
        "description": "Returns the current time in a given timezone.",
        "skills": [{"name": "get_current_time"}],
    },
}


# ── Tests ──────────────────────────────────────────────────────────────────────


def test_build_agent_tools_returns_one_tool_per_agent():
    """build_agent_tools returns exactly one tool per agent in the registry."""
    from agent_tools import build_agent_tools

    tools = build_agent_tools(SAMPLE_REGISTRY)

    assert len(tools) == 2


def test_build_agent_tools_tool_names_follow_convention():
    """Tool names must be invoke_<agent_id> with hyphens replaced by underscores."""
    from agent_tools import build_agent_tools

    tools = build_agent_tools(SAMPLE_REGISTRY)
    tool_names = {t.__name__ for t in tools}

    assert "invoke_docs_agent" in tool_names
    assert "invoke_time_agent" in tool_names


def test_build_agent_tools_tools_are_async_callable():
    """Every generated tool must wrap an async coroutine function.

    The Strands @tool decorator returns a DecoratedFunctionTool object rather
    than the raw function.  The underlying async function is accessible via the
    standard __wrapped__ attribute (set by functools.wraps) or, when strands is
    absent (fallback tool = identity), directly as the function itself.
    """
    from agent_tools import build_agent_tools

    tools = build_agent_tools(SAMPLE_REGISTRY)

    for t in tools:
        # Unwrap one level if the decorator stored the original via __wrapped__
        underlying = getattr(t, "__wrapped__", t)
        assert inspect.iscoroutinefunction(underlying), (
            f"Tool '{getattr(t, '__name__', repr(t))}' underlying function "
            f"is not an async coroutine function"
        )


@pytest.mark.anyio
async def test_build_agent_tools_error_return_on_failure():
    """When invoke_execution_agent raises, the tool must return a string starting with 'ERROR:'."""
    from agent_tools import build_agent_tools

    registry = {
        "docs-agent": {
            "name": "Docs Agent",
            "description": "Retrieves documentation.",
            "skills": [],
        }
    }

    with patch("agent_tools.invoke_execution_agent", side_effect=RuntimeError("network error")), \
         patch("agent_tools.get_agent_arn", return_value="arn:aws:bedrock:us-east-1:123456789:agent-runtime/abc"):
        tools = build_agent_tools(registry)
        assert len(tools) == 1
        result = await tools[0]("What is the API?")

    assert isinstance(result, str)
    assert result.startswith("ERROR:")


def test_build_agent_tools_empty_registry_returns_empty_list():
    """An empty registry produces an empty list of tools."""
    from agent_tools import build_agent_tools

    tools = build_agent_tools({})

    assert tools == []


def test_make_agent_tool_docstring_contains_agent_description():
    """The generated tool's __doc__ must contain the agent's description."""
    from agent_tools import make_agent_tool

    card = {
        "name": "Docs Agent",
        "description": "Retrieves documentation and answers technical questions.",
        "skills": [{"name": "search_docs"}],
    }

    t = make_agent_tool("docs-agent", card)

    assert t.__doc__ is not None
    assert "Retrieves documentation and answers technical questions." in t.__doc__


# ── file_artifact_store tests ──────────────────────────────────────────────────


@pytest.mark.anyio
async def test_file_artifact_store_populated_when_agent_returns_artifact():
    """file_artifact_store receives the artifact when execution agent response includes file_artifact."""
    import json
    from agent_tools import make_agent_tool

    card = {
        "name": "File Creator Agent",
        "description": "Creates files on demand.",
        "skills": [],
    }
    sample_artifact = {
        "artifactId": "abc-123",
        "name": "generated_file",
        "parts": [{"contentBase64": "aGVsbG8=", "fileName": "hello.txt", "mimeType": "text/plain"}],
    }
    response_json = json.dumps({
        "status": "success",
        "response_text": "File created successfully.",
        "file_artifact": sample_artifact,
    })
    file_artifact_store: dict = {}

    with patch("agent_tools.invoke_execution_agent", return_value=response_json), \
         patch("agent_tools.get_agent_arn", return_value="arn:aws:bedrock:us-east-1:123:agent/abc"):
        tool_fn = make_agent_tool("file-creator-agent", card, file_artifact_store)
        result = await tool_fn("Create hello.txt")

    assert result == "File created successfully."
    assert file_artifact_store.get("file_artifact") == sample_artifact


@pytest.mark.anyio
async def test_file_artifact_store_none_does_not_raise_when_artifact_present():
    """When file_artifact_store is None, no error occurs even if agent response has file_artifact."""
    import json
    from agent_tools import make_agent_tool

    card = {"name": "File Creator Agent", "description": "Creates files.", "skills": []}
    sample_artifact = {
        "artifactId": "xyz-456",
        "name": "generated_file",
        "parts": [{"contentBase64": "d29ybGQ=", "fileName": "world.txt", "mimeType": "text/plain"}],
    }
    response_json = json.dumps({
        "status": "success",
        "response_text": "File ready.",
        "file_artifact": sample_artifact,
    })

    with patch("agent_tools.invoke_execution_agent", return_value=response_json), \
         patch("agent_tools.get_agent_arn", return_value="arn:aws:bedrock:us-east-1:123:agent/abc"):
        tool_fn = make_agent_tool("file-creator-agent", card, None)  # store is None
        result = await tool_fn("Create world.txt")

    assert result == "File ready."


@pytest.mark.anyio
async def test_file_artifact_store_not_modified_when_no_artifact_in_response():
    """file_artifact_store is not modified when execution agent response has no file_artifact."""
    import json
    from agent_tools import make_agent_tool

    card = {"name": "Time Agent", "description": "Returns the current time.", "skills": []}
    response_json = json.dumps({
        "status": "success",
        "response_text": "現在時刻は 14:00 です。",
    })
    file_artifact_store: dict = {}

    with patch("agent_tools.invoke_execution_agent", return_value=response_json), \
         patch("agent_tools.get_agent_arn", return_value="arn:aws:bedrock:us-east-1:123:agent/time"):
        tool_fn = make_agent_tool("time-agent", card, file_artifact_store)
        result = await tool_fn("What time is it?")

    assert result == "現在時刻は 14:00 です。"
    assert "file_artifact" not in file_artifact_store
