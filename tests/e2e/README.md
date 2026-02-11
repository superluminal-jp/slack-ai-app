# E2E Tests for Slack AI App

End-to-end tests that verify the full Slack message flow:
**Slack message -> Lambda -> Verification Agent -> Slack reply**

## Prerequisites

1. **Deployed environment** (Verification + Execution stacks)
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

E2E tests send a signed app_mention to the Lambda and verify the bot reply (when configured).

## Expected Output

```
pytest tests/e2e/ -v
```

## Troubleshooting

- **Tests SKIPPED**: Ensure all required environment variables are set
- **Bot did not reply**: Ensure the bot is in the test channel and the Lambda URL is correct
- **SlackAPIError: not_in_channel**: Invite the bot to the test channel first
- **SlackAPIError: invalid_auth**: Verify `SLACK_BOT_TOKEN` is correct and not expired
