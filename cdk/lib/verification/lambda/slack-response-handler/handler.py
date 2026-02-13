"""
Slack Response Handler Lambda function.

This Lambda function processes SQS messages from the execution zone
and posts responses to Slack.
"""

import json
import os
from typing import Dict, Any, List
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
from response_handler import parse_execution_response, validate_execution_response
from slack_poster import post_to_slack, split_message_if_needed
from metrics import emit_metric
from logger import (
    set_correlation_id,
    set_lambda_context,
    log_info,
    log_error,
    log_exception,
)


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Process SQS messages from execution zone and post to Slack.

    Expected SQS event format:
    {
        "Records": [
            {
                "body": "{\"status\":\"success\",\"channel\":\"C01234567\",...}",
                "messageAttributes": {...}
            }
        ]
    }

    Args:
        event: SQS event containing ExecutionResponse messages
        context: Lambda context object

    Returns:
        dict: Batch item failures (if any) for partial batch failure reporting
    """
    # Set up logging context
    set_lambda_context(context)

    batch_item_failures: List[Dict[str, str]] = []

    # Process each SQS record
    for record in event.get("Records", []):
        message_id = record.get("messageId", "unknown")
        receipt_handle = record.get("receiptHandle", "")

        try:
            # Parse SQS message body
            message_body = record.get("body", "")
            if not message_body:
                log_error(
                    "sqs_message_empty",
                    {"message_id": message_id},
                )
                batch_item_failures.append({"itemIdentifier": message_id})
                continue

            # Parse ExecutionResponse from JSON
            try:
                execution_response = json.loads(message_body)
            except json.JSONDecodeError as e:
                log_exception(
                    "sqs_message_invalid_json",
                    {"message_id": message_id},
                    e,
                )
                batch_item_failures.append({"itemIdentifier": message_id})
                continue

            # Validate ExecutionResponse format
            if not validate_execution_response(execution_response):
                log_error(
                    "execution_response_invalid",
                    {
                        "message_id": message_id,
                        "response": execution_response,
                    },
                )
                batch_item_failures.append({"itemIdentifier": message_id})
                continue

            # Extract correlation ID if present
            correlation_id = execution_response.get("correlation_id")
            if correlation_id:
                set_correlation_id(correlation_id)

            # Parse and validate ExecutionResponse
            try:
                parsed_response = parse_execution_response(execution_response)
            except ValueError as e:
                log_exception(
                    "execution_response_parse_error",
                    {
                        "message_id": message_id,
                        "response": execution_response,
                    },
                    e,
                )
                batch_item_failures.append({"itemIdentifier": message_id})
                continue

            # Post to Slack
            try:
                if parsed_response["status"] == "success":
                    # Post success response (may be split if too long)
                    post_to_slack(
                        channel=parsed_response["channel"],
                        text=parsed_response["response_text"],
                        bot_token=parsed_response["bot_token"],
                        thread_ts=parsed_response.get("thread_ts"),
                    )
                    # Emit CloudWatch metric for successful Slack API call
                    emit_metric("SlackApiCall", 1.0, "Count")
                    log_info(
                        "slack_post_success",
                        {
                            "message_id": message_id,
                            "channel": parsed_response["channel"],
                            "response_length": len(parsed_response["response_text"]),
                            "correlation_id": correlation_id,
                        },
                    )
                    
                    # Update reaction: Remove 👀 and add ✅ to indicate success
                    if parsed_response.get("original_message_ts"):
                        try:
                            client = WebClient(token=parsed_response["bot_token"], timeout=2)
                            # Remove 👀 reaction
                            try:
                                client.reactions_remove(
                                    channel=parsed_response["channel"],
                                    name="eyes",
                                    timestamp=parsed_response["original_message_ts"]
                                )
                            except SlackApiError as e:
                                # Ignore if reaction doesn't exist
                                if e.response.get("error") != "no_reaction":
                                    log_warn("reaction_remove_failed", {
                                        "channel": parsed_response["channel"],
                                        "timestamp": parsed_response["original_message_ts"],
                                        "emoji": "eyes",
                                        "error": e.response.get("error", ""),
                                    })
                            
                            # Add ✅ reaction
                            try:
                                client.reactions_add(
                                    channel=parsed_response["channel"],
                                    name="white_check_mark",  # Slack API standard name for ✅ emoji
                                    timestamp=parsed_response["original_message_ts"]
                                )
                                log_info("reaction_updated_success", {
                                    "channel": parsed_response["channel"],
                                    "timestamp": parsed_response["original_message_ts"],
                                    "emoji": "white_check_mark",
                                })
                            except SlackApiError as e:
                                log_warn("reaction_add_success_failed", {
                                    "channel": parsed_response["channel"],
                                    "timestamp": parsed_response["original_message_ts"],
                                    "emoji": "white_check_mark",
                                    "error": e.response.get("error", ""),
                                })
                        except Exception as e:
                            log_exception("reaction_update_success_error", {
                                "channel": parsed_response["channel"],
                                "timestamp": parsed_response.get("original_message_ts"),
                            }, e)
                else:
                    # Post error response
                    post_to_slack(
                        channel=parsed_response["channel"],
                        text=parsed_response["error_message"],
                        bot_token=parsed_response["bot_token"],
                        thread_ts=parsed_response.get("thread_ts"),
                    )
                    # Emit CloudWatch metric for successful Slack API call (error message posted)
                    emit_metric("SlackApiCall", 1.0, "Count")
                    log_info(
                        "slack_post_error_success",
                        {
                            "message_id": message_id,
                            "channel": parsed_response["channel"],
                            "error_code": parsed_response.get("error_code"),
                            "correlation_id": correlation_id,
                        },
                    )
                    
                    # Update reaction: Remove 👀 and add ❌ to indicate failure
                    if parsed_response.get("original_message_ts"):
                        try:
                            client = WebClient(token=parsed_response["bot_token"], timeout=2)
                            # Remove 👀 reaction
                            try:
                                client.reactions_remove(
                                    channel=parsed_response["channel"],
                                    name="eyes",
                                    timestamp=parsed_response["original_message_ts"]
                                )
                            except SlackApiError as e:
                                # Ignore if reaction doesn't exist
                                if e.response.get("error") != "no_reaction":
                                    log_warn("reaction_remove_failed", {
                                        "channel": parsed_response["channel"],
                                        "timestamp": parsed_response["original_message_ts"],
                                        "emoji": "eyes",
                                        "error": e.response.get("error", ""),
                                    })
                            
                            # Add ❌ reaction
                            try:
                                client.reactions_add(
                                    channel=parsed_response["channel"],
                                    name="x",  # Slack API standard name for ❌ emoji
                                    timestamp=parsed_response["original_message_ts"]
                                )
                                log_info("reaction_updated_failure", {
                                    "channel": parsed_response["channel"],
                                    "timestamp": parsed_response["original_message_ts"],
                                    "emoji": "x",
                                })
                            except SlackApiError as e:
                                log_warn("reaction_add_failure_failed", {
                                    "channel": parsed_response["channel"],
                                    "timestamp": parsed_response["original_message_ts"],
                                    "emoji": "x",
                                    "error": e.response.get("error", ""),
                                })
                        except Exception as e:
                            log_exception("reaction_update_failure_error", {
                                "channel": parsed_response["channel"],
                                "timestamp": parsed_response.get("original_message_ts"),
                            }, e)

            except SlackApiError as e:
                # Slack API error
                # Emit CloudWatch metric for Slack API failure
                emit_metric("SlackApiFailure", 1.0, "Count")
                log_exception(
                    "slack_api_error",
                    {
                        "message_id": message_id,
                        "channel": parsed_response.get("channel"),
                        "error": e.response.get("error", ""),
                    },
                    e,
                )
                # Don't add to batch_item_failures for Slack API errors
                # The message will be retried by SQS if visibility timeout expires
                # Only add if it's a permanent error (e.g., invalid channel)
                if e.response.get("error") in ["channel_not_found", "invalid_auth"]:
                    batch_item_failures.append({"itemIdentifier": message_id})

            except Exception as e:
                # Unexpected error posting to Slack
                # Emit CloudWatch metric for Slack API failure
                emit_metric("SlackApiFailure", 1.0, "Count")
                log_exception(
                    "slack_post_unexpected_error",
                    {
                        "message_id": message_id,
                        "channel": parsed_response.get("channel"),
                    },
                    e,
                )
                # Add to batch_item_failures for retry
                batch_item_failures.append({"itemIdentifier": message_id})

        except Exception as e:
            # Top-level error handler
            log_exception(
                "sqs_message_processing_error",
                {"message_id": message_id},
                e,
            )
            batch_item_failures.append({"itemIdentifier": message_id})

    # Return batch item failures for partial batch failure reporting
    return {
        "batchItemFailures": batch_item_failures,
    }

