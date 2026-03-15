"""
Conftest for Web Fetch Agent tests.

Mocks FastAPI and uvicorn which are not available in the test environment.
"""

import sys
from unittest.mock import MagicMock


# ─── Mock FastAPI ───

class MockFastAPIApp:
    """Mock implementation of FastAPI for testing."""

    def __init__(self, **kwargs):
        self._routes = {}
        self._mounts = []
        self._init_kwargs = kwargs

    def get(self, path, **kwargs):
        """Decorator: register a GET route."""
        def decorator(func):
            self._routes[("GET", path)] = func
            return func
        return decorator

    def post(self, path, **kwargs):
        """Decorator: register a POST route."""
        def decorator(func):
            self._routes[("POST", path)] = func
            return func
        return decorator

    def mount(self, path, app, **kwargs):
        """Mount a sub-application at a path."""
        self._mounts.append({"path": path, "app": app})


mock_fastapi = MagicMock()
mock_fastapi.FastAPI = MockFastAPIApp
mock_fastapi.Request = MagicMock
mock_fastapi.responses = MagicMock()
sys.modules["fastapi"] = mock_fastapi
sys.modules["fastapi.responses"] = mock_fastapi.responses

# ─── Mock uvicorn ───

mock_uvicorn = MagicMock()
sys.modules["uvicorn"] = mock_uvicorn
