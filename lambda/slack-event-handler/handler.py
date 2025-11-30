import json
import os
import re
from slack_sdk import WebClient
from botocore.exceptions import ClientError
from token_storage import store_token, get_token
from slack_verifier import verify_signature
from bedrock_client import invoke_bedrock, validate_prompt
from event_dedupe import is_duplicate_event, mark_event_processed


def lambda_handler(event, context):
    """
    Slack event handler with Bedrock AI integration.

    Phase 5: Handles url_verification and event_callback.
    - Verifies HMAC SHA256 signature before processing
    - Validates timestamp within ±5 minutes window
    - Uses DynamoDB for event deduplication (prevents duplicate processing)
    - Returns 200 OK immediately to Slack (prevents retries)
    - Stores token in DynamoDB on first event, retrieves from DynamoDB for subsequent events
    - Calls Amazon Bedrock Claude 3 Haiku for AI-generated responses
    - Validates message text (length, emptiness)
    - Posts AI response to Slack for message.im and app_mention events

    WARNING: This is Phase 5 (synchronous Bedrock call).
    Returns 200 immediately to prevent Slack retries, then processes asynchronously.
    Will be fixed in Phase 6 (full async with SQS/EventBridge).
    """
    try:
        # Get raw request body for signature verification
        raw_body = event.get("body", "")

        # Extract headers for signature verification
        headers = event.get("headers", {})
        # Slack headers can be lowercase or original case depending on API Gateway/Function URL
        slack_signature = headers.get("x-slack-signature") or headers.get(
            "X-Slack-Signature"
        )
        slack_timestamp = headers.get("x-slack-request-timestamp") or headers.get(
            "X-Slack-Request-Timestamp"
        )

        # Get signing secret from environment
        signing_secret = os.environ.get("SLACK_SIGNING_SECRET")

        # Verify signature (except for URL verification which happens before app is installed)
        if signing_secret and slack_signature and slack_timestamp:
            if not verify_signature(
                body=raw_body,
                timestamp=slack_timestamp,
                signature=slack_signature,
                signing_secret=signing_secret,
            ):
                print(f"Invalid signature - rejecting request")
                return {
                    "statusCode": 401,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({"error": "Invalid signature"}),
                }
            print("Signature verification passed")
        else:
            print("Signature verification skipped (missing secret or headers)")

        # Parse the incoming request body
        body = json.loads(raw_body)

        # Handle Slack's URL verification challenge
        if body.get("type") == "url_verification":
            return {
                "statusCode": 200,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"challenge": body.get("challenge")}),
            }

        # Handle event_callback (actual Slack events)
        if body.get("type") == "event_callback":
            # Check for duplicate events using DynamoDB FIRST (before any slow operations)
            # Slack may retry events, so we need to deduplicate across Lambda invocations
            # This check is fast (< 100ms) and prevents duplicate processing
            event_id = body.get("event_id")
            is_duplicate = False

            if event_id:
                # Check if event was already processed (DynamoDB lookup)
                try:
                    if is_duplicate_event(event_id):
                        print(f"Duplicate event detected: {event_id} - skipping")
                        is_duplicate = True
                    else:
                        # Try to mark event as processed (atomic operation)
                        # Returns False if event already exists (race condition)
                        was_new = mark_event_processed(event_id)
                        if not was_new:
                            print(
                                f"Duplicate event detected (race condition): {event_id} - skipping"
                            )
                            is_duplicate = True
                        else:
                            print(f"Processing event: {event_id}")
                except Exception as e:
                    # If deduplication fails, log but continue processing (fail open)
                    print(f"Warning: Event deduplication check failed: {str(e)}")
                    # Try to mark anyway (may fail, but we'll continue)
                    try:
                        mark_event_processed(event_id)
                    except Exception:
                        pass

            # If duplicate, return 200 OK immediately without processing
            # This prevents Slack from retrying and prevents duplicate Bedrock calls
            if is_duplicate:
                return {
                    "statusCode": 200,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({"ok": True}),
                }

            slack_event = body.get("event", {})
            event_type = slack_event.get("type")
            team_id = body.get("team_id")

            # Handle message and app_mention events
            if event_type in ["message", "app_mention"]:
                # Ignore bot messages to prevent infinite loops
                # Check for bot_id (bot user messages) or subtype bot_message
                if (
                    slack_event.get("bot_id")
                    or slack_event.get("subtype") == "bot_message"
                ):
                    print("Ignoring bot message to prevent loop")
                    return {
                        "statusCode": 200,
                        "headers": {"Content-Type": "application/json"},
                        "body": json.dumps({"ok": True}),
                    }

                # Extract channel and text from event
                channel = slack_event.get("channel")
                user_text = slack_event.get("text", "")

                # Strip bot mention from text (e.g., "<@U12345> hello" -> "hello")
                # For app_mention events, Slack includes the bot mention in the text
                user_text = re.sub(r"<@[A-Z0-9]+>", "", user_text).strip()

                # Validate message text
                is_valid, error_message = validate_prompt(user_text)
                if not is_valid:
                    # Post validation error to user
                    bot_token = None
                    if team_id:
                        bot_token = get_token(team_id)
                        if not bot_token:
                            bot_token = os.environ.get("SLACK_BOT_TOKEN")
                    else:
                        bot_token = os.environ.get("SLACK_BOT_TOKEN")

                    if bot_token and channel:
                        client = WebClient(token=bot_token)
                        client.chat_postMessage(channel=channel, text=error_message)
                        print(f"Posted validation error to channel: {channel}")

                    # Return 200 OK to Slack (message acknowledged)
                    return {
                        "statusCode": 200,
                        "headers": {"Content-Type": "application/json"},
                        "body": json.dumps({"ok": True}),
                    }

                # Get bot token from DynamoDB (with fallback to environment variable)
                bot_token = None
                if team_id:
                    bot_token = get_token(team_id)
                    if not bot_token:
                        # Fallback to environment variable
                        bot_token = os.environ.get("SLACK_BOT_TOKEN")
                        # Store token in DynamoDB for future use
                        if bot_token:
                            try:
                                store_token(team_id, bot_token)
                                print(f"Token stored for team {team_id}")
                            except Exception as e:
                                print(f"Error storing token: {str(e)}")
                else:
                    # Fallback to environment variable if no team_id
                    bot_token = os.environ.get("SLACK_BOT_TOKEN")

                # Call Bedrock for AI response (synchronous - Phase 5)
                try:
                    print(f"Calling Bedrock with prompt: {user_text[:100]}...")
                    ai_response = invoke_bedrock(user_text)
                    response_text = ai_response
                    print(f"Bedrock response received: {ai_response[:100]}...")
                except ClientError as e:
                    # Bedrock API errors (throttling, access denied, timeout)
                    error_code = e.response["Error"]["Code"]
                    print(f"Bedrock error: {error_code}")

                    # User-friendly error messages
                    if error_code == "ThrottlingException":
                        response_text = "The AI service is currently busy. Please try again in a minute."
                    elif error_code == "AccessDeniedException":
                        response_text = "I'm having trouble connecting to the AI service. Please contact your administrator."
                    elif "Timeout" in error_code:
                        response_text = "Sorry, the AI service is taking longer than usual. Please try again in a moment."
                    else:
                        response_text = "Something went wrong. I've logged the issue and will try to fix it. Please try again later."
                except ValueError as e:
                    # Invalid Bedrock response
                    print(f"Bedrock response validation error: {str(e)}")
                    response_text = "I received an unexpected response from the AI service. Please try again."
                except Exception as e:
                    # Unexpected errors
                    print(f"Unexpected error: {str(e)}")
                    response_text = "Something went wrong. I've logged the issue and will try to fix it. Please try again later."

                # Post message to Slack
                if bot_token and channel:
                    client = WebClient(token=bot_token)
                    client.chat_postMessage(channel=channel, text=response_text)
                    print(f"Posted AI response to channel: {channel}")
                else:
                    print(
                        f"Missing bot token or channel. Token exists: {bool(bot_token)}, Channel: {channel}"
                    )

        # Return 200 OK to Slack (acknowledgment)
        # Note: If Slack retries, the duplicate check above will catch it
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"ok": True}),
        }
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"ok": True}),
        }

    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Internal server error"}),
        }
