"""
E2E tests for Slack AI App full flow.

Tests the complete pipeline by posting a signed Slack event_callback payload
directly to the Lambda Function URL, then polling Slack for the bot's reply.

NOTE: chat.postMessage with the bot token posts AS the bot. The handler
ignores bot messages (bot_id check) to prevent infinite loops. Therefore,
we simulate what Slack does: POST a signed event_callback to the Lambda URL.

Prerequisites:
    SLACK_BOT_TOKEN: Bot OAuth token (for reading replies)
    SLACK_SIGNING_SECRET: Slack app signing secret (for HMAC signature)
    SLACK_TEST_CHANNEL: Channel ID where bot is a member
    SLACK_BOT_USER_ID: Bot user ID for @mentions
    LAMBDA_FUNCTION_URL: Lambda Function URL endpoint
    SLACK_TEAM_ID: Workspace team ID
"""

import hashlib
import hmac
import json
import time
import uuid

import requests


class SlackAPIError(Exception):
    """Raised when Slack API returns an error response."""

    def __init__(self, method: str, error: str, status_code: int = 200):
        self.method = method
        self.error = error
        self.status_code = status_code
        super().__init__(f"Slack API {method} failed: {error} (HTTP {status_code})")


def _slack_api(
    method: str,
    token: str,
    params: dict | None = None,
    json_body: dict | None = None,
    retries: int = 3,
) -> dict:
    """Call Slack Web API with retry logic for transient errors."""
    url = f"https://slack.com/api/{method}"
    headers = {"Authorization": f"Bearer {token}"}

    last_error = None
    for attempt in range(retries):
        try:
            if json_body:
                resp = requests.post(url, headers=headers, json=json_body, timeout=10)
            else:
                resp = requests.get(url, headers=headers, params=params, timeout=10)

            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", "5"))
                time.sleep(retry_after)
                continue

            if resp.status_code >= 500:
                time.sleep(2 ** attempt)
                continue

            data = resp.json()
            if not data.get("ok"):
                error = data.get("error", "unknown_error")
                if error in ("internal_error", "service_unavailable", "request_timeout"):
                    time.sleep(2 ** attempt)
                    last_error = SlackAPIError(method, error, resp.status_code)
                    continue
                raise SlackAPIError(method, error, resp.status_code)

            return data

        except requests.exceptions.RequestException as e:
            last_error = e
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            raise

    raise last_error or SlackAPIError(method, "max_retries_exceeded")


def _sign_request(body: str, signing_secret: str) -> tuple[str, str]:
    """Compute Slack HMAC-SHA256 signature for the request body.

    Returns:
        (timestamp, signature) tuple for use in request headers.
    """
    timestamp = str(int(time.time()))
    sig_basestring = f"v0:{timestamp}:{body}"
    my_signature = "v0=" + hmac.new(
        signing_secret.encode(), sig_basestring.encode(), hashlib.sha256
    ).hexdigest()
    return timestamp, my_signature


def _send_event_to_lambda(
    lambda_url: str,
    body: str,
    signing_secret: str,
    retries: int = 3,
) -> dict:
    """POST a signed Slack event payload to the Lambda Function URL.

    Returns:
        Lambda response as dict (parsed JSON body).
    """
    last_error = None
    for attempt in range(retries):
        timestamp, signature = _sign_request(body, signing_secret)
        headers = {
            "Content-Type": "application/json",
            "X-Slack-Signature": signature,
            "X-Slack-Request-Timestamp": timestamp,
        }
        try:
            resp = requests.post(lambda_url, headers=headers, data=body, timeout=30)
            if resp.status_code >= 500:
                time.sleep(2 ** attempt)
                last_error = RuntimeError(
                    f"Lambda returned {resp.status_code}: {resp.text[:200]}"
                )
                continue
            return {"status_code": resp.status_code, "body": resp.text}
        except requests.exceptions.RequestException as e:
            last_error = e
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            raise

    raise last_error or RuntimeError("max_retries_exceeded")


def _build_app_mention_event(
    channel: str,
    text: str,
    team_id: str,
    message_ts: str,
    user_id: str = "U_E2E_TEST",
    event_id: str | None = None,
) -> str:
    """Build a Slack event_callback payload for an app_mention event.

    Args:
        message_ts: A real Slack message timestamp. The echo reply will be
            posted as a thread reply to this message, so it must exist.
    """
    event_id = event_id or f"Ev{uuid.uuid4().hex[:10].upper()}"
    payload = {
        "token": "e2e_verification_token",
        "team_id": team_id,
        "api_app_id": "A_E2E_TEST",
        "event": {
            "type": "app_mention",
            "user": user_id,
            "text": text,
            "ts": message_ts,
            "channel": channel,
            "event_ts": message_ts,
        },
        "type": "event_callback",
        "event_id": event_id,
        "event_time": int(time.time()),
    }
    return json.dumps(payload)

