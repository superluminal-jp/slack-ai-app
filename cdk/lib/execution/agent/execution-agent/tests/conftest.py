"""
Conftest for Execution Agent tests.

Mocks the bedrock_agentcore SDK which is not available in the test environment.
"""

import sys
from unittest.mock import MagicMock

# Mock the bedrock_agentcore SDK before any agent modules are imported
mock_sdk = MagicMock()

# Create a mock BedrockAgentCoreApp class
class _MockRoute:
    """Minimal mock of a Starlette Route for route inspection in tests."""

    def __init__(self, path, methods):
        self.path = path
        self.methods = set(methods or [])


class MockBedrockAgentCoreApp:
    """Mock implementation of BedrockAgentCoreApp for testing."""

    def __init__(self):
        self._entrypoint_fn = None
        self._routes_dict = {}
        self.routes = [
            # SDK registers /invocations by default
            _MockRoute("/invocations", ["POST"]),
            _MockRoute("/ping", ["GET"]),
        ]

    def entrypoint(self, func):
        """Decorator: register the A2A entrypoint function."""
        self._entrypoint_fn = func
        return func

    def route(self, path, methods=None):
        """Decorator: register a route handler."""
        def decorator(func):
            self._routes_dict[path] = func
            self.routes.append(_MockRoute(path, methods))
            return func
        return decorator

    def add_async_task(self, task_name: str) -> str:
        """Mock: create an async task, return a fake task ID."""
        return f"mock-task-{task_name}"

    def complete_async_task(self, task_id: str, result: str) -> None:
        """Mock: complete an async task."""
        pass

    def run(self, port: int = 8080):
        """Mock: start the A2A server."""
        pass


mock_sdk.runtime.BedrockAgentCoreApp = MockBedrockAgentCoreApp
sys.modules["bedrock_agentcore"] = mock_sdk
sys.modules["bedrock_agentcore.runtime"] = mock_sdk.runtime
