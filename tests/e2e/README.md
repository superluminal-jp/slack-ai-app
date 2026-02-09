# E2E Tests for Slack AI App

End-to-end tests that verify the full Slack message flow:
**Slack message -> Lambda -> Verification Agent -> Slack reply**

## Prerequisites

1. **Deployed environment** with echo mode enabled (`VALIDATION_ZONE_ECHO_MODE=true`)
2. **Slack Bot** added to the test channel
3. **Environment variables** set before running tests

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SLACK_BOT_TOKEN` | Bot User OAuth Token | `xoxb-1234-5678-abcd` |
| `SLACK_TEST_CHANNEL` | Channel ID for test messages | `C0123456789` |
| `SLACK_BOT_USER_ID` | Bot's user ID (for @mentions) | `U0123456789` |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `E2E_TIMEOUT` | `60` | Max wait time for bot reply (seconds) |
| `E2E_POLL_INTERVAL` | `2` | Polling interval for reply check (seconds) |
| `E2E_RETRIES` | `3` | Retries on transient Slack API errors |

## Usage

```bash
# Set required env vars
export SLACK_BOT_TOKEN="xoxb-..."
export SLACK_TEST_CHANNEL="C0123456789"
export SLACK_BOT_USER_ID="U0123456789"

# Run all E2E tests
pytest tests/e2e/ -v

# Run with longer timeout (for slow environments)
E2E_TIMEOUT=120 pytest tests/e2e/ -v
```

## Test Cases

### `test_echo_mode_full_flow`
Sends a message mentioning the bot and verifies:
- Bot replies within the timeout window
- Reply contains `[Echo]` prefix
- Reply contains the original test text
- Reports latency for each step

### `test_echo_mode_preserves_thread`
Verifies the bot reply is posted in the same thread as the original message.

## Expected Output

```
tests/e2e/test_slack_flow.py::TestEchoModeFullFlow::test_echo_mode_full_flow PASSED
tests/e2e/test_slack_flow.py::TestEchoModeFullFlow::test_echo_mode_preserves_thread PASSED

--- E2E Latency Report (test_id=a1b2c3d4) ---
  Post message:   0.45s
  Wait for reply: 8.23s
  Total:          8.68s
```

## Troubleshooting

- **Tests SKIPPED**: Ensure all required environment variables are set
- **Bot did not reply**: Check that echo mode is enabled and the bot is in the test channel
- **SlackAPIError: not_in_channel**: Invite the bot to the test channel first
- **SlackAPIError: invalid_auth**: Verify `SLACK_BOT_TOKEN` is correct and not expired
