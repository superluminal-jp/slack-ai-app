"""
Bedrock processor Lambda handler.

This Lambda function processes Slack events asynchronously:
1. Receives event payload from Slack Event Handler (slack-event-handler)
2. Invokes Bedrock API for AI inference
3. Posts AI response to Slack

Phase 6: Async processing to meet Slack's 3-second timeout requirement.
"""

import json
import os
from botocore.exceptions import ClientError, ReadTimeoutError

from bedrock_client import invoke_bedrock
from slack_poster import post_to_slack


def log_event(level: str, event_type: str, data: dict, context=None):
    """
    Structured logging helper for CloudWatch-friendly JSON logs.
    
    Args:
        level: Log level (INFO, WARN, ERROR)
        event_type: Event type identifier (e.g., "bedrock_request", "slack_post_success")
        data: Event-specific data dictionary
        context: Lambda context object (optional, for request_id)
    """
    log_entry = {
        "level": level,
        "event": event_type,
        **data
    }
    
    if context and hasattr(context, "request_id"):
        log_entry["request_id"] = context.request_id
    
    print(json.dumps(log_entry))

# Error message catalog (per research.md and Phase 7 preview)
ERROR_MESSAGES = {
    "bedrock_timeout": "Sorry, the AI service is taking longer than usual. Please try again in a moment.",
    "bedrock_throttling": "The AI service is currently busy. Please try again in a minute.",
    "bedrock_access_denied": "I'm having trouble connecting to the AI service. Please contact your administrator.",
    "invalid_response": "I received an unexpected response from the AI service. Please try again.",
    "generic": "Something went wrong. I've logged the issue and will try to fix it. Please try again later.",
}


def lambda_handler(event, context):
    """
    Process Slack event with Bedrock AI and post response to Slack.

    Expected event payload:
    {
        "channel": "C01234567",
        "text": "User message text",
        "bot_token": "xoxb-..."
    }

    Args:
        event: Lambda event payload from Slack Event Handler
        context: Lambda context object

    Returns:
        dict: Lambda response (not used for async invocations)
    """
    try:
        # Parse event payload
        # Slack Event Handler sends JSON string in event body for async invocations
        if isinstance(event, str):
            payload = json.loads(event)
        elif isinstance(event, dict) and "body" in event:
            payload = json.loads(event["body"])
        else:
            payload = event

        channel = payload.get("channel")
        text = payload.get("text")
        bot_token = payload.get("bot_token")

        # Validate required fields
        if not channel:
            log_event("ERROR", "payload_validation_failed", {
                "reason": "missing_channel"
            }, context)
            return {"statusCode": 400, "body": "Missing channel"}

        if not text:
            log_event("ERROR", "payload_validation_failed", {
                "reason": "missing_text"
            }, context)
            return {"statusCode": 400, "body": "Missing text"}

        if not bot_token:
            log_event("ERROR", "payload_validation_failed", {
                "reason": "missing_bot_token"
            }, context)
            return {"statusCode": 400, "body": "Missing bot_token"}

        log_event("INFO", "bedrock_request_received", {
            "channel": channel,
            "text_length": len(text),
            "model_id": os.environ.get("BEDROCK_MODEL_ID", "amazon.nova-pro-v1:0")
        }, context)

        # Invoke Bedrock for AI response
        try:
            ai_response = invoke_bedrock(text)
            log_event("INFO", "bedrock_response_received", {
                "channel": channel,
                "response_length": len(ai_response),
                "input_length": len(text)
            }, context)
        except ReadTimeoutError as e:
            # HTTP connection timeout (botocore ReadTimeoutError)
            log_event("ERROR", "bedrock_timeout", {
                "channel": channel,
                "error": str(e),
                "error_type": "ReadTimeoutError"
            }, context)
            error_message = ERROR_MESSAGES["bedrock_timeout"]
            post_to_slack(channel, error_message, bot_token)
            log_event("INFO", "error_message_posted", {
                "channel": channel,
                "error_type": "timeout"
            }, context)
            return {"statusCode": 200, "body": "Timeout error handled"}
        except ClientError as e:
            # Bedrock API errors (throttling, access denied, timeout)
            error_code = e.response["Error"]["Code"]
            log_event("ERROR", "bedrock_api_error", {
                "channel": channel,
                "error_code": error_code,
                "error_message": e.response["Error"].get("Message", "")
            }, context)

            # Select appropriate error message
            if error_code == "ThrottlingException":
                error_message = ERROR_MESSAGES["bedrock_throttling"]
            elif error_code == "AccessDeniedException":
                error_message = ERROR_MESSAGES["bedrock_access_denied"]
            elif "Timeout" in error_code:
                error_message = ERROR_MESSAGES["bedrock_timeout"]
            else:
                error_message = ERROR_MESSAGES["generic"]

            # Post error message to Slack
            post_to_slack(channel, error_message, bot_token)
            log_event("INFO", "error_message_posted", {
                "channel": channel,
                "error_code": error_code
            }, context)
            return {"statusCode": 200, "body": "Error handled"}

        except ValueError as e:
            # Invalid Bedrock response
            log_event("ERROR", "bedrock_response_validation_failed", {
                "channel": channel,
                "error": str(e)
            }, context)
            error_message = ERROR_MESSAGES["invalid_response"]
            post_to_slack(channel, error_message, bot_token)
            log_event("INFO", "error_message_posted", {
                "channel": channel,
                "error_type": "validation"
            }, context)
            return {"statusCode": 200, "body": "Validation error handled"}

        except Exception as e:
            # Unexpected errors
            log_event("ERROR", "bedrock_unexpected_error", {
                "channel": channel,
                "error": str(e),
                "error_type": type(e).__name__
            }, context)
            error_message = ERROR_MESSAGES["generic"]
            post_to_slack(channel, error_message, bot_token)
            log_event("INFO", "error_message_posted", {
                "channel": channel,
                "error_type": "generic"
            }, context)
            return {"statusCode": 200, "body": "Error handled"}

        # Post AI response to Slack
        try:
            post_to_slack(channel, ai_response, bot_token)
            log_event("INFO", "slack_post_success", {
                "channel": channel,
                "response_length": len(ai_response)
            }, context)
            return {"statusCode": 200, "body": "Success"}

        except Exception as e:
            # Error posting to Slack
            log_event("ERROR", "slack_post_failed", {
                "channel": channel,
                "error": str(e),
                "error_type": type(e).__name__
            }, context)
            # Log error but don't retry (async invocation)
            return {"statusCode": 500, "body": "Slack posting failed"}

    except Exception as e:
        # Top-level error handler
        log_event("ERROR", "unhandled_exception", {
            "error": str(e),
            "error_type": type(e).__name__
        }, context)
        # Log error to CloudWatch
        # Note: Cannot post to Slack here because we don't have channel/token
        return {"statusCode": 500, "body": "Internal error"}

