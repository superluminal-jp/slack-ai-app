"""Shared fixtures for Doc Search Agent tests."""

import os
import sys

import pytest

# Add parent directory to path so tests can import agent modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture(autouse=True)
def env_defaults(monkeypatch):
    """Set default environment variables for all tests."""
    monkeypatch.setenv("BEDROCK_MODEL_ID", "amazon.nova-pro-v1:0")
    monkeypatch.setenv("AWS_REGION_NAME", "ap-northeast-1")
    monkeypatch.setenv("LOG_LEVEL", "WARNING")
