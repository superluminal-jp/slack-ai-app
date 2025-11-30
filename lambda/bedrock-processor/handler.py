"""
Bedrock processor Lambda handler.

This Lambda function processes Slack events asynchronously:
1. Receives event payload from Lambda① (slack-event-handler)
2. Invokes Bedrock API for AI inference
3. Posts AI response to Slack

Phase 6: Async processing to meet Slack's 3-second timeout requirement.
"""

import json
import os
from botocore.exceptions import ClientError

from bedrock_client import invoke_bedrock
from slack_poster import post_to_slack

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
        event: Lambda event payload from Lambda①
        context: Lambda context object

    Returns:
        dict: Lambda response (not used for async invocations)
    """
    try:
        # Parse event payload
        # Lambda① sends JSON string in event body for async invocations
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
            print("Error: Missing channel in payload")
            return {"statusCode": 400, "body": "Missing channel"}

        if not text:
            print("Error: Missing text in payload")
            return {"statusCode": 400, "body": "Missing text"}

        if not bot_token:
            print("Error: Missing bot_token in payload")
            return {"statusCode": 400, "body": "Missing bot_token"}

        print(f"Processing Bedrock request for channel: {channel}")
        print(f"User message length: {len(text)} characters")

        # Invoke Bedrock for AI response
        try:
            ai_response = invoke_bedrock(text)
            print(f"Bedrock response received: {ai_response[:100]}...")
        except ClientError as e:
            # Bedrock API errors (throttling, access denied, timeout)
            error_code = e.response["Error"]["Code"]
            print(f"Bedrock error: {error_code}")

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
            print(f"Posted error message to Slack: {error_code}")
            return {"statusCode": 200, "body": "Error handled"}

        except ValueError as e:
            # Invalid Bedrock response
            print(f"Bedrock response validation error: {str(e)}")
            error_message = ERROR_MESSAGES["invalid_response"]
            post_to_slack(channel, error_message, bot_token)
            print("Posted validation error message to Slack")
            return {"statusCode": 200, "body": "Validation error handled"}

        except Exception as e:
            # Unexpected errors
            print(f"Unexpected error: {str(e)}")
            error_message = ERROR_MESSAGES["generic"]
            post_to_slack(channel, error_message, bot_token)
            print("Posted generic error message to Slack")
            return {"statusCode": 200, "body": "Error handled"}

        # Post AI response to Slack
        try:
            post_to_slack(channel, ai_response, bot_token)
            print(f"Posted AI response to channel: {channel}")
            return {"statusCode": 200, "body": "Success"}

        except Exception as e:
            # Error posting to Slack
            print(f"Error posting to Slack: {str(e)}")
            # Log error but don't retry (async invocation)
            return {"statusCode": 500, "body": "Slack posting failed"}

    except Exception as e:
        # Top-level error handler
        print(f"Unexpected error in lambda_handler: {str(e)}")
        # Log error to CloudWatch
        # Note: Cannot post to Slack here because we don't have channel/token
        return {"statusCode": 500, "body": "Internal error"}

