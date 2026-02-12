"""
E2E test configuration for Slack AI App.

Loads test configuration from environment variables:
- SLACK_BOT_TOKEN: Slack Bot OAuth token (xoxb-...)
- SLACK_SIGNING_SECRET: Slack app signing secret for HMAC signature
- SLACK_TEST_CHANNEL: Channel ID for test messages (e.g., C0123456789)
- SLACK_BOT_USER_ID: Bot user ID for mentions (e.g., U0123456789)
- LAMBDA_FUNCTION_URL: Lambda Function URL endpoint
- SLACK_TEAM_ID: Slack workspace team ID (e.g., T0123456789)
- E2E_TIMEOUT: Max wait time for bot reply in seconds (default: 60)
- E2E_POLL_INTERVAL: Polling interval in seconds (default: 2)
- E2E_RETRIES: Number of retries on transient errors (default: 3)
"""

import os

import pytest


def _require_env(name: str) -> str:
    """Return env var value or skip the test with a clear message."""
    value = os.environ.get(name)
    if not value:
        pytest.skip(f"Environment variable {name} is required for E2E tests")
    return value


@pytest.fixture
def slack_bot_token() -> str:
    return _require_env("SLACK_BOT_TOKEN")


@pytest.fixture
def slack_signing_secret() -> str:
    return _require_env("SLACK_SIGNING_SECRET")


@pytest.fixture
def slack_test_channel() -> str:
    return _require_env("SLACK_TEST_CHANNEL")


@pytest.fixture
def slack_bot_user_id() -> str:
    return _require_env("SLACK_BOT_USER_ID")


@pytest.fixture
def lambda_function_url() -> str:
    return _require_env("LAMBDA_FUNCTION_URL")


@pytest.fixture
def slack_team_id() -> str:
    return _require_env("SLACK_TEAM_ID")


@pytest.fixture
def e2e_timeout() -> int:
    return int(os.environ.get("E2E_TIMEOUT", "60"))


@pytest.fixture
def e2e_poll_interval() -> float:
    return float(os.environ.get("E2E_POLL_INTERVAL", "2"))


@pytest.fixture
def e2e_retries() -> int:
    return int(os.environ.get("E2E_RETRIES", "3"))
