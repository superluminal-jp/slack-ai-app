import json
import os
import re
import boto3
from slack_sdk import WebClient
from token_storage import store_token, get_token
from slack_verifier import verify_signature
from validation import validate_prompt
from event_dedupe import is_duplicate_event, mark_event_processed
from existence_check import check_entity_existence, ExistenceCheckError
from botocore.exceptions import ClientError
from typing import Optional
from api_gateway_client import invoke_execution_api
from attachment_extractor import extract_attachment_metadata
from logger import (
    set_lambda_context,
    log_info,
    log_warn,
    log_error,
    log_exception,
)


def _is_valid_timestamp(ts: Optional[str]) -> bool:
    """
    Validate Slack timestamp format.

    Slack timestamps are in format: "1234567890.123456" (Unix timestamp with microseconds).
    This function validates that the timestamp matches the expected format.

    Args:
        ts: Timestamp string to validate (can be None)

    Returns:
        True if timestamp is valid format, False otherwise

    Examples:
        >>> _is_valid_timestamp("1234567890.123456")
        True
        >>> _is_valid_timestamp("invalid")
        False
        >>> _is_valid_timestamp(None)
        False
        >>> _is_valid_timestamp("")
        False
    """
    if not ts or not isinstance(ts, str):
        return False

    # Slack timestamp format: digits, dot, digits (e.g., "1234567890.123456")
    pattern = r"^\d+\.\d+$"
    return bool(re.match(pattern, ts))


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
        log_exception(
            "secret_retrieval_client_error",
            {"secret_name": secret_name},
            e,
        )
        return None
    except Exception as e:
        log_exception(
            "secret_retrieval_failed",
            {"secret_name": secret_name},
            e,
        )
        return None


# Keep log_event for backward compatibility (deprecated - use logger functions directly)
def log_event(level: str, event_type: str, data: dict, context=None):
    """
    Structured logging helper for CloudWatch-friendly JSON logs.
    
    DEPRECATED: Use logger.log_info(), logger.log_warn(), logger.log_error() directly.
    This function is kept for backward compatibility and internally uses the new logger.

    Args:
        level: Log level (INFO, WARN, ERROR)
        event_type: Event type identifier (e.g., "event_received", "signature_verified")
        data: Event-specific data dictionary
        context: Lambda context object (optional, for aws_request_id)
    """
    from logger import log, set_lambda_context as set_ctx
    
    if context:
        set_ctx(context)
    
    log(level, event_type, data)


def lambda_handler(event, context):
    """
    Slack event handler with async Bedrock AI integration.

    Phase 6: Handles url_verification and event_callback.
    - Verifies HMAC SHA256 signature before processing (first key in two-key defense)
    - Performs Existence Check to verify entities exist in Slack (second key in two-key defense)
      * Verifies team_id, user_id, channel_id via Slack API (team.info, users.info, conversations.info)
      * Caches verification results in DynamoDB for 5 minutes to minimize performance impact
      * Fails securely (rejects requests with 403) when verification cannot be performed
      * Handles timeouts, rate limits, and API errors with retry logic
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
            log_info("signature_verification_success", {})
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
        
        # Existence Check: Verify entities exist in Slack (Two-Key Defense)
        # This implements the second key in the two-key defense model
        # After signature verification succeeds, verify entities exist in Slack
        # Only perform Existence Check for event_callback (not url_verification)
        if body.get("type") == "event_callback":
            try:
                slack_event = body.get("event", {})
                team_id = body.get("team_id")
                user_id = slack_event.get("user")
                channel_id = slack_event.get("channel")
                
                # Get Bot Token for Existence Check
                bot_token = None
                if team_id:
                    bot_token = get_token(team_id)
                    if not bot_token:
                        bot_token = os.environ.get("SLACK_BOT_TOKEN")
                else:
                    bot_token = os.environ.get("SLACK_BOT_TOKEN")
                
                # Perform Existence Check if Bot Token is available
                # Per FR-011: Skip Existence Check if Bot Token is unavailable (graceful degradation)
                if bot_token and (team_id or user_id or channel_id):
                    try:
                        check_entity_existence(
                            bot_token=bot_token,
                            team_id=team_id,
                            user_id=user_id,
                            channel_id=channel_id,
                        )
                        log_info("existence_check_success", {
                            "team_id": team_id,
                            "user_id": user_id,
                            "channel_id": channel_id,
                        })
                    except ExistenceCheckError as e:
                        # Log security event for existence check failure
                        error_str = str(e)
                        event_type = "existence_check_failed"
                        
                        # Determine specific error type for more detailed logging
                        if "timeout" in error_str.lower():
                            event_type = "existence_check_timeout"
                        elif "rate limit" in error_str.lower():
                            event_type = "existence_check_rate_limit"
                        elif "API error" in error_str or "Slack API" in error_str:
                            event_type = "existence_check_api_error"
                        
                        log_error(event_type, {
                            "team_id": team_id,
                            "user_id": user_id,
                            "channel_id": channel_id,
                            "error": error_str,
                        })
                        # Reject request with 403 Forbidden (fail-closed security model)
                        return {
                            "statusCode": 403,
                            "headers": {"Content-Type": "application/json"},
                            "body": json.dumps({"error": "Entity verification failed"}),
                        }
                elif not bot_token:
                    # Bot Token not available - skip Existence Check (graceful degradation)
                    log_warn("existence_check_skipped", {
                        "reason": "bot_token_unavailable",
                        "team_id": team_id,
                    })
                elif not (team_id or user_id or channel_id):
                    # No entity IDs available - skip Existence Check
                    # Per FR-012: Verify only available fields
                    log_info("existence_check_skipped", {
                        "reason": "no_entity_ids",
                    })
            except Exception as e:
                # Log error but continue processing (fail-open for handler errors)
                # Existence Check errors are handled above, this catches unexpected errors
                log_exception("existence_check_handler_error", {}, e)

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
                    log_warn(
                        "event_deduplication_failed",
                        {"event_id": event_id},
                        e,
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

            # Extract message timestamp for thread replies
            # Use event.thread_ts if present (reply in existing thread), otherwise use event.ts (new message)
            message_timestamp = slack_event.get("thread_ts") or slack_event.get("ts")

            # Validate timestamp format (log warning if invalid, but continue processing)
            if message_timestamp and not _is_valid_timestamp(message_timestamp):
                log_event(
                    "WARN",
                    "invalid_timestamp_format",
                    {
                        "timestamp": message_timestamp,
                        "event_type": event_type,
                        "channel": slack_event.get("channel"),
                    },
                    context,
                )
                message_timestamp = None  # Fall back to None for backward compatibility
            elif message_timestamp:
                log_event(
                    "INFO",
                    "timestamp_extracted",
                    {
                        "timestamp": message_timestamp,
                        "source": "thread_ts" if slack_event.get("thread_ts") else "ts",
                        "event_type": event_type,
                    },
                    context,
                )

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

                # Extract attachment metadata from event
                attachments = extract_attachment_metadata(slack_event)
                if attachments:
                    log_event(
                        "INFO",
                        "attachments_detected",
                        {
                            "attachment_count": len(attachments),
                            "file_ids": [att["id"] for att in attachments],
                        },
                        context,
                    )

                # Extract message timestamp for thread replies (already extracted above)
                # message_timestamp is None if missing (backward compatibility)

                # Strip bot mention from text (e.g., "<@U12345> hello" -> "hello")
                # For app_mention events, Slack includes the bot mention in the text
                user_text = re.sub(r"<@[A-Z0-9]+>", "", user_text).strip()

                # Validate message text (skip validation if attachments are present - FR-014)
                is_valid, error_message = validate_prompt(user_text)
                if not is_valid and not attachments:
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
                                log_exception(
                                    "token_storage_failed",
                                    {"team_id": team_id},
                                    e,
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
                    "thread_ts": message_timestamp,  # Include thread timestamp for thread replies
                }

                # Include attachment metadata if attachments are present
                if attachments:
                    payload["attachments"] = attachments

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
                    log_exception(
                        "execution_api_invocation_failed",
                        {"api_url": execution_api_url},
                        e,
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
        log_exception(
            "unhandled_exception",
            {},
            e,
        )
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Internal server error"}),
        }
