"""Conftest for Docs Agent tests (FastAPI/uvicorn mocks)."""

import sys
from unittest.mock import MagicMock


class MockFastAPIApp:
    """Mock implementation of FastAPI for testing."""

    def __init__(self, **kwargs):
        self._routes = {}
        self._mounts = []
        self._init_kwargs = kwargs

    def get(self, path, **kwargs):
        def decorator(func):
            self._routes[("GET", path)] = func
            return func
        return decorator

    def post(self, path, **kwargs):
        def decorator(func):
            self._routes[("POST", path)] = func
            return func
        return decorator

    def mount(self, path, app, **kwargs):
        self._mounts.append({"path": path, "app": app})


mock_fastapi = MagicMock()
mock_fastapi.FastAPI = MockFastAPIApp
mock_fastapi.Request = MagicMock
mock_fastapi.responses = MagicMock()
sys.modules["fastapi"] = mock_fastapi
sys.modules["fastapi.responses"] = mock_fastapi.responses

mock_uvicorn = MagicMock()
sys.modules["uvicorn"] = mock_uvicorn


# Minimal strands mock for unit tests
class _MockAgent:
    def __init__(self, **kwargs):
        self._kwargs = kwargs

    def __call__(self, *_args, **_kwargs):
        return MagicMock(message={"content": [{"text": "mock"}], "role": "assistant"})


def _tool(func):
    return func


mock_strands = MagicMock()
mock_strands.Agent = _MockAgent
mock_strands.tool = _tool
sys.modules["strands"] = mock_strands

mock_bedrock = MagicMock()
mock_bedrock.BedrockModel = MagicMock
sys.modules["strands.models"] = MagicMock()
sys.modules["strands.models.bedrock"] = mock_bedrock
