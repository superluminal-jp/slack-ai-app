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


def _poll_for_reply(
    token: str,
    channel: str,
    thread_ts: str,
    timeout: int,
    poll_interval: float,
    retries: int,
) -> dict | None:
    """Poll Slack for a bot reply containing [Echo] in a specific thread.

    Args:
        thread_ts: Parent message timestamp to check for replies.

    Returns the first reply containing [Echo], or None on timeout.
    """
    deadline = time.time() + timeout

    while time.time() < deadline:
        time.sleep(poll_interval)

        replies = _slack_api(
            "conversations.replies",
            token=token,
            params={
                "channel": channel,
                "ts": thread_ts,
                "limit": 20,
            },
            retries=retries,
        )

        for msg in replies.get("messages", []):
            # Skip the parent message itself
            if msg.get("ts") == thread_ts:
                continue
            text = msg.get("text", "")
            if "[Echo]" in text:
                return msg

    return None


class TestEchoModeFullFlow:
    """E2E: Send signed event_callback to Lambda -> verify bot replies with [Echo]."""

    def test_echo_mode_full_flow(
        self,
        slack_bot_token: str,
        slack_signing_secret: str,
        slack_test_channel: str,
        slack_bot_user_id: str,
        lambda_function_url: str,
        slack_team_id: str,
        e2e_timeout: int,
        e2e_poll_interval: float,
        e2e_retries: int,
    ):
        """Send a signed app_mention event to Lambda and verify [Echo] reply in Slack.

        Flow:
            1. Post a real message to Slack (creates a valid thread anchor)
            2. Build app_mention event_callback using the real message ts
            3. Sign with HMAC-SHA256 and POST to Lambda Function URL
            4. Poll thread for bot reply containing [Echo]
            5. Assert response and record latency
        """
        test_id = uuid.uuid4().hex[:8]
        test_text = f"<@{slack_bot_user_id}> E2E test {test_id}"

        latency: dict[str, float] = {}

        # Step 1: Post a real message to create a valid thread anchor
        t0 = time.time()
        anchor = _slack_api(
            "chat.postMessage",
            token=slack_bot_token,
            json_body={
                "channel": slack_test_channel,
                "text": f"[E2E anchor] {test_id}",
            },
            retries=e2e_retries,
        )
        message_ts = anchor["ts"]
        latency["post_anchor"] = time.time() - t0

        # Step 2: Build and send signed event to Lambda (using real message_ts)
        # Use bot_user_id as the event sender — it's a real Slack user that passes
        # existence checks. The handler's bot_id check only looks at event.bot_id
        # (not event.user), so this won't be filtered as a bot message.
        t1 = time.time()
        event_body = _build_app_mention_event(
            channel=slack_test_channel,
            text=test_text,
            team_id=slack_team_id,
            message_ts=message_ts,
            user_id=slack_bot_user_id,
        )
        lambda_result = _send_event_to_lambda(
            lambda_url=lambda_function_url,
            body=event_body,
            signing_secret=slack_signing_secret,
            retries=e2e_retries,
        )
        latency["send_event"] = time.time() - t1

        assert lambda_result["status_code"] == 200, (
            f"Lambda returned non-200: {lambda_result['status_code']} — "
            f"{lambda_result['body'][:300]}"
        )

        # Step 3: Poll thread for bot reply
        t2 = time.time()
        bot_reply = _poll_for_reply(
            token=slack_bot_token,
            channel=slack_test_channel,
            thread_ts=message_ts,
            timeout=e2e_timeout,
            poll_interval=e2e_poll_interval,
            retries=e2e_retries,
        )
        latency["wait_for_reply"] = time.time() - t2
        latency["total"] = time.time() - t0

        # Step 4: Assert bot replied with [Echo] prefix
        assert bot_reply is not None, (
            f"Bot did not reply within {e2e_timeout}s. "
            f"Lambda status: {lambda_result['status_code']}, "
            f"Lambda body: {lambda_result['body'][:200]}, "
            f"anchor ts: {message_ts}"
        )

        reply_text = bot_reply.get("text", "")
        assert "[Echo]" in reply_text, (
            f"Bot reply does not contain [Echo] prefix. Got: {reply_text!r}"
        )

        # Verify echo contains our test text (stripped of bot mention)
        assert f"E2E test {test_id}" in reply_text, (
            f"Bot reply does not contain test text. "
            f"Expected 'E2E test {test_id}' in: {reply_text!r}"
        )

        # Step 5: Report latency
        print(f"\n--- E2E Latency Report (test_id={test_id}) ---")
        print(f"  Post anchor:    {latency['post_anchor']:.2f}s")
        print(f"  Send event:     {latency['send_event']:.2f}s")
        print(f"  Wait for reply: {latency['wait_for_reply']:.2f}s")
        print(f"  Total:          {latency['total']:.2f}s")

    def test_echo_mode_reply_in_thread(
        self,
        slack_bot_token: str,
        slack_signing_secret: str,
        slack_test_channel: str,
        slack_bot_user_id: str,
        lambda_function_url: str,
        slack_team_id: str,
        e2e_timeout: int,
        e2e_poll_interval: float,
        e2e_retries: int,
    ):
        """Verify bot reply is in the correct thread (thread_ts matches anchor)."""
        test_id = uuid.uuid4().hex[:8]
        test_text = f"<@{slack_bot_user_id}> thread test {test_id}"

        # Post anchor message
        anchor = _slack_api(
            "chat.postMessage",
            token=slack_bot_token,
            json_body={
                "channel": slack_test_channel,
                "text": f"[E2E anchor] {test_id}",
            },
            retries=e2e_retries,
        )
        message_ts = anchor["ts"]

        # Send signed event to Lambda (use bot_user_id as real Slack user)
        event_body = _build_app_mention_event(
            channel=slack_test_channel,
            text=test_text,
            team_id=slack_team_id,
            message_ts=message_ts,
            user_id=slack_bot_user_id,
        )
        lambda_result = _send_event_to_lambda(
            lambda_url=lambda_function_url,
            body=event_body,
            signing_secret=slack_signing_secret,
            retries=e2e_retries,
        )
        assert lambda_result["status_code"] == 200

        # Poll for reply in thread
        bot_reply = _poll_for_reply(
            token=slack_bot_token,
            channel=slack_test_channel,
            thread_ts=message_ts,
            timeout=e2e_timeout,
            poll_interval=e2e_poll_interval,
            retries=e2e_retries,
        )

        assert bot_reply is not None, (
            f"Bot did not reply within {e2e_timeout}s for thread test"
        )

        # Verify reply is in the correct thread
        assert bot_reply.get("thread_ts") == message_ts, (
            f"Reply not in correct thread. "
            f"Expected thread_ts={message_ts}, got={bot_reply.get('thread_ts')}"
        )

        # Verify reply contains the test text
        reply_text = bot_reply.get("text", "")
        assert f"thread test {test_id}" in reply_text, (
            f"Reply doesn't contain expected text. Got: {reply_text!r}"
        )
