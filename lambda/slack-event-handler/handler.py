import json
import os
import re
import boto3
from slack_sdk import WebClient
from token_storage import store_token, get_token
from slack_verifier import verify_signature
from validation import validate_prompt
from event_dedupe import is_duplicate_event, mark_event_processed
from botocore.exceptions import ClientError
from typing import Optional
from api_gateway_client import invoke_execution_api

# Cache for secrets (to avoid repeated API calls)
_secrets_cache: dict[str, str] = {}


def get_secret_from_secrets_manager(secret_name: str) -> Optional[str]:
    """
    Retrieve secret value from AWS Secrets Manager with caching.

    This function fetches secrets from AWS Secrets Manager and caches them
    in memory to reduce API calls and improve performance.

    Args:
        secret_name: Name or ARN of the secret in Secrets Manager

    Returns:
        Secret value as string if successful, None otherwise

    Raises:
        ClientError: If Secrets Manager API call fails
    """
    # Check cache first
    if secret_name in _secrets_cache:
        return _secrets_cache[secret_name]

    try:
        secrets_client = boto3.client("secretsmanager")
        response = secrets_client.get_secret_value(SecretId=secret_name)
        secret_value = response["SecretString"]

        # Cache the secret value
        _secrets_cache[secret_name] = secret_value
        return secret_value
    except ClientError as e:
        print(f"Error retrieving secret {secret_name}: {str(e)}")
        return None
    except Exception as e:
        print(f"Unexpected error retrieving secret {secret_name}: {str(e)}")
        return None


def log_event(level: str, event_type: str, data: dict, context=None):
    """
    Structured logging helper for CloudWatch-friendly JSON logs.

    Args:
        level: Log level (INFO, WARN, ERROR)
        event_type: Event type identifier (e.g., "event_received", "signature_verified")
        data: Event-specific data dictionary
        context: Lambda context object (optional, for request_id)
    """
    log_entry = {"level": level, "event": event_type, **data}

    if context and hasattr(context, "request_id"):
        log_entry["request_id"] = context.request_id

    print(json.dumps(log_entry))


def lambda_handler(event, context):
    """
    Slack event handler with async Bedrock AI integration.

    Phase 6: Handles url_verification and event_callback.
    - Verifies HMAC SHA256 signature before processing
    - Validates timestamp within ±5 minutes window
    - Uses DynamoDB for event deduplication (prevents duplicate processing)
    - Returns 200 OK immediately to Slack (<3 seconds)
    - Stores token in DynamoDB on first event, retrieves from DynamoDB for subsequent events
    - Validates message text (length, emptiness)
    - Invokes Bedrock Processor (bedrock-processor) asynchronously for AI processing
    - Bedrock Processor handles Bedrock API call and Slack posting
    """
    try:
        # Log event received
        log_event(
            "INFO",
            "event_received",
            {
                "source": "slack",
                "has_body": bool(event.get("body")),
                "has_headers": bool(event.get("headers")),
            },
            context,
        )
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

        # Get signing secret from Secrets Manager or environment variable (fallback)
        signing_secret_name = os.environ.get("SLACK_SIGNING_SECRET_NAME")
        if signing_secret_name:
            signing_secret = get_secret_from_secrets_manager(signing_secret_name)
        else:
            # Fallback to environment variable for backward compatibility
            signing_secret = os.environ.get("SLACK_SIGNING_SECRET")

        # Verify signature (except for URL verification which happens before app is installed)
        if signing_secret and slack_signature and slack_timestamp:
            if not verify_signature(
                body=raw_body,
                timestamp=slack_timestamp,
                signature=slack_signature,
                signing_secret=signing_secret,
            ):
                log_event(
                    "WARN",
                    "signature_verification_failed",
                    {
                        "reason": "invalid_signature",
                        "has_timestamp": bool(slack_timestamp),
                        "has_signature": bool(slack_signature),
                    },
                    context,
                )
                return {
                    "statusCode": 401,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({"error": "Invalid signature"}),
                }
            log_event("INFO", "signature_verification_success", {}, context)
        else:
            log_event(
                "INFO",
                "signature_verification_skipped",
                {
                    "reason": "missing_secret_or_headers",
                    "has_secret": bool(signing_secret),
                    "has_signature": bool(slack_signature),
                    "has_timestamp": bool(slack_timestamp),
                },
                context,
            )

        # Parse the incoming request body
        body = json.loads(raw_body)

        # Handle Slack's URL verification challenge
        if body.get("type") == "url_verification":
            log_event(
                "INFO",
                "url_verification_challenge",
                {"challenge_present": bool(body.get("challenge"))},
                context,
            )
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
                        log_event(
                            "INFO",
                            "duplicate_event_detected",
                            {"event_id": event_id, "reason": "already_processed"},
                            context,
                        )
                        is_duplicate = True
                    else:
                        # Try to mark event as processed (atomic operation)
                        # Returns False if event already exists (race condition)
                        was_new = mark_event_processed(event_id)
                        if not was_new:
                            log_event(
                                "INFO",
                                "duplicate_event_detected",
                                {"event_id": event_id, "reason": "race_condition"},
                                context,
                            )
                            is_duplicate = True
                        else:
                            log_event(
                                "INFO",
                                "event_processing_started",
                                {"event_id": event_id},
                                context,
                            )
                except Exception as e:
                    # If deduplication fails, log but continue processing (fail open)
                    log_event(
                        "WARN",
                        "event_deduplication_failed",
                        {"event_id": event_id, "error": str(e)},
                        context,
                    )
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

            # Log event details
            log_event(
                "INFO",
                "event_callback_received",
                {
                    "event_type": event_type,
                    "team_id": team_id,
                    "channel": slack_event.get("channel"),
                    "user": slack_event.get("user"),
                },
                context,
            )

            # Handle message and app_mention events
            if event_type in ["message", "app_mention"]:
                # Ignore bot messages to prevent infinite loops
                # Check for bot_id (bot user messages) or subtype bot_message
                if (
                    slack_event.get("bot_id")
                    or slack_event.get("subtype") == "bot_message"
                ):
                    log_event(
                        "INFO",
                        "bot_message_ignored",
                        {
                            "reason": "prevent_loop",
                            "bot_id": slack_event.get("bot_id"),
                            "subtype": slack_event.get("subtype"),
                        },
                        context,
                    )
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
                    log_event(
                        "WARN",
                        "message_validation_failed",
                        {
                            "team_id": team_id,
                            "channel": channel,
                            "text_length": len(user_text),
                            "error": error_message,
                        },
                        context,
                    )

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
                        log_event(
                            "INFO",
                            "validation_error_posted",
                            {"channel": channel},
                            context,
                        )

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
                            # Fallback to Secrets Manager or environment variable
                            bot_token_secret_name = os.environ.get(
                                "SLACK_BOT_TOKEN_SECRET_NAME"
                            )
                            if bot_token_secret_name:
                                bot_token = get_secret_from_secrets_manager(
                                    bot_token_secret_name
                                )
                            else:
                                # Fallback to environment variable for backward compatibility
                                bot_token = os.environ.get("SLACK_BOT_TOKEN")
                        # Store token in DynamoDB for future use
                        if bot_token:
                            try:
                                store_token(team_id, bot_token)
                                log_event(
                                    "INFO",
                                    "token_stored",
                                    {"team_id": team_id},
                                    context,
                                )
                            except Exception as e:
                                log_event(
                                    "ERROR",
                                    "token_storage_failed",
                                    {"team_id": team_id, "error": str(e)},
                                    context,
                                )
                else:
                    # Fallback to Secrets Manager or environment variable if no team_id
                    bot_token_secret_name = os.environ.get(
                        "SLACK_BOT_TOKEN_SECRET_NAME"
                    )
                    if bot_token_secret_name:
                        bot_token = get_secret_from_secrets_manager(
                            bot_token_secret_name
                        )
                    else:
                        # Fallback to environment variable for backward compatibility
                        bot_token = os.environ.get("SLACK_BOT_TOKEN")

                # Invoke Execution Layer via API Gateway with IAM authentication
                execution_api_url = os.environ.get("EXECUTION_API_URL", "")
                if not execution_api_url:
                    log_event(
                        "ERROR",
                        "execution_api_url_missing",
                        {"error": "EXECUTION_API_URL environment variable not set"},
                        context,
                    )
                    return {
                        "statusCode": 500,
                        "headers": {"Content-Type": "application/json"},
                        "body": json.dumps({"error": "Configuration error"}),
                    }

                # Create payload for Execution Layer
                payload = {
                    "channel": channel,
                    "text": user_text,
                    "bot_token": bot_token,
                }

                try:
                    # Use API Gateway with IAM authentication
                    log_event(
                        "INFO",
                        "execution_api_invocation_started",
                        {
                            "api_url": execution_api_url,
                            "channel": channel,
                            "text_length": len(user_text),
                        },
                        context,
                    )

                    response = invoke_execution_api(
                        api_url=execution_api_url,
                        payload=payload,
                        region=os.environ.get("AWS_REGION_NAME", "ap-northeast-1"),
                    )

                    # Accept both 200 and 202 as success
                    # 200: Lambda proxy integration returns Lambda's statusCode
                    # 202: Preferred for async operations
                    if response.status_code in [200, 202]:
                        log_event(
                            "INFO",
                            "execution_api_invocation_success",
                            {
                                "api_url": execution_api_url,
                                "status_code": response.status_code,
                            },
                            context,
                        )
                    else:
                        log_event(
                            "ERROR",
                            "execution_api_invocation_failed",
                            {
                                "api_url": execution_api_url,
                                "status_code": response.status_code,
                                "response_body": response.text,
                            },
                            context,
                        )
                        # Log error but still return 200 OK to Slack (prevent retries)
                        # Execution Layer error handling will post error message to Slack
                except Exception as e:
                    # Error invoking Execution Layer via API Gateway
                    log_event(
                        "ERROR",
                        "execution_api_invocation_failed",
                        {
                            "api_url": execution_api_url,
                            "error": str(e),
                        },
                        context,
                    )
                    # Log error but still return 200 OK to Slack (prevent retries)
                    # Execution Layer error handling will post error message to Slack

        # Return 200 OK to Slack (acknowledgment)
        # Note: If Slack retries, the duplicate check above will catch it
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"ok": True}),
        }

    except Exception as e:
        log_event(
            "ERROR",
            "unhandled_exception",
            {"error": str(e), "error_type": type(e).__name__},
            context,
        )
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Internal server error"}),
        }
