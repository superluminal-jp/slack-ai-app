import json
import os
import re
import time
import uuid
import boto3
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
from token_storage import store_token, get_token
from slack_verifier import verify_signature
from validation import validate_prompt
from event_dedupe import is_duplicate_event, mark_event_processed
from existence_check import check_entity_existence, ExistenceCheckError
from authorization import authorize_request, AuthorizationError
from rate_limiter import check_rate_limit, RateLimitExceededError
from botocore.exceptions import ClientError
from typing import Optional
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
                # Unexpected error in Existence Check handler - fail-closed (security priority)
                # This should not happen, but if it does, reject the request for security
                log_exception("existence_check_handler_error", {
                    "team_id": body.get("team_id"),
                    "user_id": body.get("event", {}).get("user"),
                    "channel_id": body.get("event", {}).get("channel"),
                }, e)
                return {
                    "statusCode": 403,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({"error": "Entity verification failed"}),
                }
        
        # Whitelist Authorization (3c): Check if entities are in whitelist
        # This implements layer 3c in the multi-layer defense architecture
        # Only perform authorization for event_callback (not url_verification)
        if body.get("type") == "event_callback":
            try:
                slack_event = body.get("event", {})
                team_id = body.get("team_id")
                user_id = slack_event.get("user")
                channel_id = slack_event.get("channel")
                
                # Perform whitelist authorization
                auth_result = authorize_request(
                    team_id=team_id,
                    user_id=user_id,
                    channel_id=channel_id,
                )
                
                if not auth_result.authorized:
                    # Authorization failed - reject request (fail-closed)
                    log_error("whitelist_authorization_failed", {
                        "team_id": team_id,
                        "user_id": user_id,
                        "channel_id": channel_id,
                        "unauthorized_entities": auth_result.unauthorized_entities,
                        "error_message": auth_result.error_message,
                    })
                    return {
                        "statusCode": 403,
                        "headers": {"Content-Type": "application/json"},
                        "body": json.dumps({"error": "Authorization failed"}),
                    }
                
                # Authorization succeeded - continue processing
                log_info("whitelist_authorization_success", {
                    "team_id": team_id,
                    "user_id": user_id,
                    "channel_id": channel_id,
                })
            except Exception as e:
                # Unexpected error in authorization handler - fail-closed (security priority)
                # This should not happen, but if it does, reject the request for security
                log_exception("whitelist_authorization_handler_error", {
                    "team_id": team_id,
                    "user_id": user_id,
                    "channel_id": channel_id,
                }, e)
                return {
                    "statusCode": 403,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({"error": "Authorization failed"}),
                }

        # Rate Limiting: Check user-level rate limit (DDoS protection)
        # Only perform rate limiting for event_callback (not url_verification)
        if body.get("type") == "event_callback":
            try:
                slack_event = body.get("event", {})
                team_id = body.get("team_id")
                user_id = slack_event.get("user")
                
                # Perform rate limit check
                if team_id or user_id:
                    try:
                        is_allowed, remaining = check_rate_limit(
                            team_id=team_id,
                            user_id=user_id,
                        )
                        
                        if not is_allowed:
                            # Rate limit exceeded - reject request
                            log_error("rate_limit_exceeded", {
                                "team_id": team_id,
                                "user_id": user_id,
                            })
                            return {
                                "statusCode": 429,
                                "headers": {"Content-Type": "application/json"},
                                "body": json.dumps({
                                    "error": "Rate limit exceeded. Please try again in a moment."
                                }),
                            }
                        
                        # Rate limit check passed - continue processing
                        if remaining is not None:
                            log_info("rate_limit_check_passed", {
                                "team_id": team_id,
                                "user_id": user_id,
                                "remaining_requests": remaining,
                            })
                    except RateLimitExceededError as e:
                        # Rate limit exceeded - reject request
                        log_error("rate_limit_exceeded", {
                            "team_id": team_id,
                            "user_id": user_id,
                            "error": str(e),
                        })
                        return {
                            "statusCode": 429,
                            "headers": {"Content-Type": "application/json"},
                            "body": json.dumps({
                                "error": "Rate limit exceeded. Please try again in a moment."
                            }),
                        }
            except Exception as e:
                # Unexpected error in rate limiter - log but continue processing (graceful degradation)
                # Rate limiting failures should not block legitimate requests
                log_exception("rate_limit_handler_error", {
                    "team_id": body.get("team_id"),
                    "user_id": body.get("event", {}).get("user"),
                }, e)
                # Continue processing (fail-open for rate limiting errors)

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

                # Add 👀 reaction to indicate request received (non-blocking)
                # Best practice: Use "eyes" emoji to show message is being reviewed/processed
                if bot_token and channel and slack_event.get("ts"):
                    try:
                        client = WebClient(token=bot_token, timeout=2)
                        client.reactions_add(
                            channel=channel,
                            name="eyes",  # Slack API standard name for 👀 emoji
                            timestamp=slack_event.get("ts")
                        )
                        log_info("reaction_added", {
                            "channel": channel,
                            "timestamp": slack_event.get("ts"),
                            "emoji": "eyes",
                            "emoji_display": "👀",
                            "team_id": team_id,
                        })
                    except SlackApiError as e:
                        error_code = e.response.get("error", "")
                        if error_code == "already_reacted":
                            log_info("reaction_already_exists", {
                                "channel": channel,
                                "timestamp": slack_event.get("ts"),
                                "emoji": "eyes",
                            })
                        elif error_code == "missing_scope":
                            log_warn("reaction_add_missing_scope", {
                                "channel": channel,
                                "timestamp": slack_event.get("ts"),
                                "error": error_code,
                                "required_scope": "reactions:write",
                            })
                        else:
                            log_warn("reaction_add_failed", {
                                "channel": channel,
                                "timestamp": slack_event.get("ts"),
                                "error": error_code,
                                "error_message": str(e),
                            })
                    except Exception as e:
                        log_exception("reaction_add_unexpected_error", {
                            "channel": channel,
                            "timestamp": slack_event.get("ts"),
                        }, e)

                # ─── 018: Echo is handled at Verification Agent (Runtime); Lambda always sends to SQS when queue URL is set ───
                # ─── 016: Async path — send to SQS and return 200 immediately ───
                queue_url = (os.environ.get("AGENT_INVOCATION_QUEUE_URL") or "").strip()
                if queue_url:
                    try:
                        request = {
                            "channel": channel,
                            "text": user_text,
                            "bot_token": bot_token,
                            "thread_ts": message_timestamp,
                            "attachments": attachments if attachments else [],
                            "correlation_id": str(context.aws_request_id if context else ""),
                            "team_id": team_id,
                            "user_id": slack_event.get("user"),
                            "event_id": event_id,
                        }
                        sqs_client = boto3.client(
                            "sqs",
                            region_name=os.environ.get("AWS_REGION_NAME", "ap-northeast-1"),
                        )
                        sqs_client.send_message(QueueUrl=queue_url, MessageBody=json.dumps(request))
                        log_info(
                            "sqs_enqueue_success",
                            {
                                "channel": channel,
                                "event_id": event_id,
                                "request_id": getattr(context, "aws_request_id", ""),
                            },
                        )
                        return {
                            "statusCode": 200,
                            "headers": {"Content-Type": "application/json"},
                            "body": json.dumps({"ok": True}),
                        }
                    except Exception as e:
                        log_exception(
                            "sqs_enqueue_failed",
                            {"channel": channel, "event_id": event_id},
                            e,
                        )
                        return {
                            "statusCode": 500,
                            "headers": {"Content-Type": "application/json"},
                            "body": json.dumps({"error": "Internal server error"}),
                        }

                # ─── A2A: Invoke Verification Agent (AgentCore) ───
                verification_agent_arn = (os.environ.get("VERIFICATION_AGENT_ARN") or "").strip()
                if not verification_agent_arn:
                    log_error(
                        "agentcore_misconfigured",
                        {"error": "VERIFICATION_AGENT_ARN is not set"},
                    )
                    return {
                        "statusCode": 200,
                        "headers": {"Content-Type": "application/json"},
                        "body": json.dumps({"ok": True}),
                    }

                try:
                    agentcore_client = boto3.client(
                        "bedrock-agentcore",
                        region_name=os.environ.get("AWS_REGION_NAME", "ap-northeast-1"),
                    )

                    task_data = {
                        "channel": channel,
                        "text": user_text,
                        "bot_token": bot_token,
                        "thread_ts": message_timestamp,
                        "attachments": attachments if attachments else [],
                        "correlation_id": str(
                            context.aws_request_id if context else ""
                        ),
                        "team_id": team_id,
                        "user_id": slack_event.get("user"),
                    }
                    a2a_payload = {"prompt": json.dumps(task_data)}
                    session_id = str(uuid.uuid4())

                    log_info(
                        "agentcore_invocation_started",
                        {
                            "verification_agent_arn": verification_agent_arn,
                            "channel": channel,
                            "session_id": session_id,
                        },
                    )

                    payload_bytes = json.dumps(a2a_payload).encode("utf-8")
                    agentcore_client.invoke_agent_runtime(
                        agentRuntimeArn=verification_agent_arn,
                        runtimeSessionId=session_id,
                        payload=payload_bytes,
                    )

                    log_info(
                        "agentcore_invocation_success",
                        {
                            "verification_agent_arn": verification_agent_arn,
                            "channel": channel,
                        },
                    )

                except Exception as e:
                    log_exception(
                        "agentcore_invocation_failed",
                        {
                            "verification_agent_arn": verification_agent_arn,
                            "channel": channel,
                        },
                        e,
                    )

                return {
                    "statusCode": 200,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({"ok": True}),
                }

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
