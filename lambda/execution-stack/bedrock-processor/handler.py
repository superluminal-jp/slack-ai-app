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
import time
from botocore.exceptions import ClientError, ReadTimeoutError
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

from bedrock_client_converse import invoke_bedrock
from slack_poster import post_to_slack
from thread_history import get_thread_history, build_conversation_context
from attachment_processor import process_attachments
from logger import (
    set_correlation_id,
    set_lambda_context,
    log_info,
    log_warn,
    log_error,
    log_exception,
    log_performance,
)


# Error message catalog - user-friendly messages for various error scenarios
# Following best practices: specific, actionable, and localized
ERROR_MESSAGES = {
    # Bedrock API errors
    "bedrock_timeout": "Sorry, the AI service is taking longer than usual. Please try again in a moment.",
    "bedrock_throttling": "The AI service is currently busy. Please try again in a minute.",
    "bedrock_access_denied": "I'm having trouble connecting to the AI service. Please contact your administrator.",
    "invalid_response": "I received an unexpected response from the AI service. Please try again.",
    # Image processing errors (categorized by error_code from attachment_processor)
    "image_processing_error": "I couldn't process the image you sent. Please try sending a different image format (PNG, JPEG, GIF, or WebP) or a smaller image.",
    "image_download_failed": "I couldn't download the image you sent. Please make sure the image is shared in a channel I have access to, or try uploading it again.",
    "image_unsupported_type": "The image format is not supported. Please send images in PNG, JPEG, GIF, or WebP format.",
    "image_too_large": "The image is too large (max 10MB). Please send a smaller image.",
    "image_permission_error": "I don't have permission to access this image. Please check that the bot has been added to this channel and has 'files:read' permission.",
    # Document processing errors
    "document_too_large": "The document is too large (max 5MB). Please send a smaller document.",
    "document_extraction_failed": "I couldn't read the content of this document. Please try a different file.",
    # Unsupported file type errors
    "unsupported_file_type": "I don't support this file type. I can process images (PNG, JPEG, GIF, WebP) and documents (PDF, DOCX, CSV, XLSX, PPTX, TXT). Please send a supported file type.",
    # Generic fallback
    "generic": "Something went wrong. I've logged the issue and will try to fix it. Please try again later.",
}


def _get_error_message_for_attachment_failure(error_code: str) -> str:
    """
    Map attachment processor error codes to user-friendly error messages.

    Args:
        error_code: Machine-readable error code from attachment_processor

    Returns:
        User-friendly error message
    """
    error_code_mapping = {
        "unsupported_image_type": "image_unsupported_type",
        "file_too_large": "image_too_large",
        "url_not_available": "image_download_failed",
        "download_failed": "image_download_failed",
        "extraction_failed": "document_extraction_failed",
        "unsupported_type": "unsupported_file_type",
    }

    message_key = error_code_mapping.get(error_code, "generic")
    return ERROR_MESSAGES.get(message_key, ERROR_MESSAGES["generic"])


def lambda_handler(event, context):
    """
    Process Slack event with Bedrock AI and post response to Slack.

    Expected event payload:
    {
        "channel": "C01234567",
        "text": "User message text",
        "bot_token": "xoxb-...",
        "correlation_id": "req-abc123" (optional)
    }

    Args:
        event: Lambda event payload from Slack Event Handler
        context: Lambda context object

    Returns:
        dict: Lambda response (not used for async invocations)
    """
    # Set up logging context
    set_lambda_context(context)

    try:
        # Parse event payload
        # Slack Event Handler sends JSON string in event body for async invocations
        if isinstance(event, str):
            payload = json.loads(event)
        elif isinstance(event, dict) and "body" in event:
            payload = json.loads(event["body"])
        else:
            payload = event

        # Set correlation ID for all subsequent logs
        correlation_id = payload.get("correlation_id") or (
            context.aws_request_id if context else None
        )
        set_correlation_id(correlation_id)

        channel = payload.get("channel")
        text = payload.get("text", "")  # May be empty if attachments only
        bot_token = payload.get("bot_token")
        thread_ts = payload.get("thread_ts")  # Optional: timestamp for thread replies
        attachments_metadata = payload.get(
            "attachments", []
        )  # Optional: attachment metadata

        # Validate required fields
        if not channel:
            log_error(
                "payload_validation_failed",
                {"reason": "missing_channel", "payload_keys": list(payload.keys())},
            )
            return {"statusCode": 400, "body": "Missing channel"}

        # Text is optional if attachments are present (per FR-014)
        if not text and not attachments_metadata:
            log_error(
                "payload_validation_failed",
                {
                    "reason": "missing_text_and_attachments",
                    "payload_keys": list(payload.keys()),
                },
            )
            return {"statusCode": 400, "body": "Missing text and attachments"}

        if not bot_token:
            log_error(
                "payload_validation_failed",
                {"reason": "missing_bot_token", "payload_keys": list(payload.keys())},
            )
            return {"statusCode": 400, "body": "Missing bot_token"}

        log_info(
            "bedrock_request_received",
            {
                "channel": channel,
                "text_length": len(text) if text else 0,
                "attachment_count": len(attachments_metadata),
                "thread_ts": thread_ts,
                "model_id": os.environ.get("BEDROCK_MODEL_ID", "amazon.nova-pro-v1:0"),
            },
        )

        # Process attachments if present
        processed_attachments = []
        if attachments_metadata:
            try:
                log_info(
                    "attachment_processing_started",
                    {
                        "channel": channel,
                        "attachment_count": len(attachments_metadata),
                    },
                )
                processed_attachments = process_attachments(
                    attachments_metadata, bot_token, correlation_id
                )

                # Count successful, failed, and skipped attachments
                success_count = len(
                    [
                        a
                        for a in processed_attachments
                        if a.get("processing_status") == "success"
                    ]
                )
                failed_count = len(
                    [
                        a
                        for a in processed_attachments
                        if a.get("processing_status") == "failed"
                    ]
                )
                skipped_count = len(
                    [
                        a
                        for a in processed_attachments
                        if a.get("processing_status") == "skipped"
                    ]
                )

                log_info(
                    "attachments_processed",
                    {
                        "channel": channel,
                        "total_attachments": len(attachments_metadata),
                        "processed_count": success_count,
                        "failed_count": failed_count,
                        "skipped_count": skipped_count,
                    },
                )

                # If ALL attachments failed or were skipped and no text provided,
                # return a specific error message
                if success_count == 0 and not text.strip():
                    # Check for unsupported file types (skipped)
                    skipped_attachments = [
                        a
                        for a in processed_attachments
                        if a.get("processing_status") == "skipped"
                    ]

                    if skipped_attachments:
                        # All attachments are unsupported file types
                        error_message = ERROR_MESSAGES["unsupported_file_type"]
                        post_to_slack(channel, error_message, bot_token, thread_ts)
                        log_info(
                            "error_message_posted",
                            {
                                "channel": channel,
                                "error_type": "unsupported_file_type",
                                "skipped_count": len(skipped_attachments),
                            },
                        )
                        return {
                            "statusCode": 200,
                            "body": "Unsupported file type error handled",
                        }

                    # Check for failed image attachments
                    image_attachments = [
                        a
                        for a in attachments_metadata
                        if a.get("mimetype", "").startswith("image/")
                    ]
                    if image_attachments:
                        # All images failed, no text - user needs specific feedback
                        # Collect error codes to determine the most appropriate message
                        failed_images = [
                            a
                            for a in processed_attachments
                            if a.get("processing_status") == "failed"
                            and a.get("content_type") == "image"
                        ]
                        error_codes = [
                            a.get("error_code", "unknown") for a in failed_images
                        ]
                        error_messages = [
                            a.get("error_message", "unknown") for a in failed_images
                        ]

                        log_warn(
                            "all_image_attachments_failed",
                            {
                                "channel": channel,
                                "image_count": len(image_attachments),
                                "error_codes": error_codes,
                                "error_messages": error_messages,
                            },
                        )

                        # Select most specific error message based on error codes
                        if error_codes:
                            primary_error_code = error_codes[0]
                            error_message = _get_error_message_for_attachment_failure(
                                primary_error_code
                            )
                        else:
                            error_message = ERROR_MESSAGES["image_download_failed"]

                        post_to_slack(channel, error_message, bot_token, thread_ts)
                        log_info(
                            "error_message_posted",
                            {
                                "channel": channel,
                                "error_type": "image_attachment_failed",
                                "primary_error_code": (
                                    error_codes[0] if error_codes else "unknown"
                                ),
                            },
                        )
                        return {
                            "statusCode": 200,
                            "body": "Image download error handled",
                        }

                    # If no images and all attachments failed/skipped, return generic error
                    if failed_count > 0:
                        # Some attachments failed (not just skipped)
                        failed_attachments = [
                            a
                            for a in processed_attachments
                            if a.get("processing_status") == "failed"
                        ]
                        if failed_attachments:
                            primary_error_code = failed_attachments[0].get(
                                "error_code", "unknown"
                            )
                            error_message = _get_error_message_for_attachment_failure(
                                primary_error_code
                            )
                            post_to_slack(channel, error_message, bot_token, thread_ts)
                            log_info(
                                "error_message_posted",
                                {
                                    "channel": channel,
                                    "error_type": "attachment_failed",
                                    "primary_error_code": primary_error_code,
                                },
                            )
                            return {
                                "statusCode": 200,
                                "body": "Attachment error handled",
                            }

            except Exception as e:
                # Log error but continue processing (graceful degradation per FR-008)
                log_exception(
                    "attachment_processing_failed",
                    {
                        "channel": channel,
                        "attachment_count": (
                            len(attachments_metadata) if attachments_metadata else 0
                        ),
                    },
                    e,
                )
                # Continue without attachments - process text only
                processed_attachments = []

        # Get thread history if thread_ts is provided
        conversation_history = None
        if thread_ts:
            try:
                client = WebClient(token=bot_token)
                thread_messages = get_thread_history(client, channel, thread_ts)

                if thread_messages:
                    # Use thread history directly (without adding current message)
                    # Current message will be added by invoke_bedrock with attachments
                    conversation_history = thread_messages
                    log_info(
                        "thread_history_retrieved",
                        {
                            "channel": channel,
                            "thread_ts": thread_ts,
                            "history_length": len(thread_messages),
                            "conversation_length": len(thread_messages),
                        },
                    )
                else:
                    log_info(
                        "thread_history_empty",
                        {"channel": channel, "thread_ts": thread_ts},
                    )
            except SlackApiError as e:
                # Log error but continue without history (graceful degradation)
                log_warn(
                    "thread_history_retrieval_failed",
                    {"channel": channel, "thread_ts": thread_ts},
                    e,
                )
                # Continue without conversation history

        # Prepare images and document texts from processed attachments
        # Converse API uses binary image data (not Base64)
        images = []
        image_formats = []
        document_texts = []

        for attachment in processed_attachments:
            if attachment.get("processing_status") == "success":
                content_type = attachment.get("content_type")
                content = attachment.get("content")

                if content_type == "image" and content:
                    # Extract format from MIME type (e.g., "image/png" -> "png")
                    mimetype = attachment.get("mimetype", "image/png")
                    image_format = mimetype.split("/")[-1].lower()

                    # Map to Converse API format values
                    format_mapping = {
                        "jpg": "jpeg",
                        "jpeg": "jpeg",
                        "png": "png",
                        "gif": "gif",
                        "webp": "webp",
                    }
                    image_format = format_mapping.get(image_format, "png")

                    # Validate image data
                    if not isinstance(content, bytes):
                        log_error(
                            "image_content_invalid_type",
                            {
                                "channel": channel,
                                "file_id": attachment.get("file_id"),
                                "content_type": str(type(content)),
                            },
                        )
                        continue

                    images.append(content)  # Binary data
                    image_formats.append(image_format)
                    log_info(
                        "image_content_prepared",
                        {
                            "channel": channel,
                            "file_id": attachment.get("file_id"),
                            "mimetype": mimetype,
                            "format": image_format,
                            "data_size": len(content),
                        },
                    )
                elif content_type == "document" and content:
                    # Add document text
                    document_texts.append(content)

        # Invoke Bedrock for AI response (using Converse API)
        try:
            start_time = time.time()
            ai_response = invoke_bedrock(
                text or "",  # Empty string if no text (attachments only)
                conversation_history,
                images=images if images else None,
                image_formats=image_formats if image_formats else None,
                document_texts=document_texts if document_texts else None,
            )
            duration_ms = (time.time() - start_time) * 1000
            log_performance(
                "bedrock_response_received",
                "bedrock_invoke",
                duration_ms,
                {
                    "channel": channel,
                    "response_length": len(ai_response),
                    "input_length": len(text) if text else 0,
                    "image_count": len(images) if images else 0,
                    "document_count": len(document_texts) if document_texts else 0,
                    "api_type": "converse",
                },
            )
        except ReadTimeoutError as e:
            # HTTP connection timeout (botocore ReadTimeoutError)
            log_exception(
                "bedrock_timeout",
                {"channel": channel},
                e,
            )
            error_message = ERROR_MESSAGES["bedrock_timeout"]
            post_to_slack(channel, error_message, bot_token, thread_ts)
            log_info(
                "error_message_posted",
                {"channel": channel, "error_type": "timeout"},
            )
            return {"statusCode": 200, "body": "Timeout error handled"}
        except ClientError as e:
            # Bedrock API errors (throttling, access denied, timeout)
            error_code = e.response["Error"]["Code"]
            log_exception(
                "bedrock_api_error",
                {
                    "channel": channel,
                    "error_code": error_code,
                    "error_message": e.response["Error"].get("Message", ""),
                },
                e,
            )

            # Select appropriate error message
            error_detail = e.response["Error"].get("Message", "")
            if error_code == "ThrottlingException":
                error_message = ERROR_MESSAGES["bedrock_throttling"]
            elif error_code == "AccessDeniedException":
                error_message = ERROR_MESSAGES["bedrock_access_denied"]
            elif "Timeout" in error_code:
                error_message = ERROR_MESSAGES["bedrock_timeout"]
            elif (
                error_code == "ValidationException" and "image" in error_detail.lower()
            ):
                # Image processing error from Bedrock
                error_message = ERROR_MESSAGES["image_processing_error"]
            else:
                error_message = ERROR_MESSAGES["generic"]

            # Post error message to Slack
            post_to_slack(channel, error_message, bot_token, thread_ts)
            log_info(
                "error_message_posted",
                {"channel": channel, "error_code": error_code},
            )
            return {"statusCode": 200, "body": "Error handled"}

        except ValueError as e:
            # Invalid Bedrock response
            log_exception(
                "bedrock_response_validation_failed",
                {"channel": channel},
                e,
            )
            error_message = ERROR_MESSAGES["invalid_response"]
            post_to_slack(channel, error_message, bot_token, thread_ts)
            log_info(
                "error_message_posted",
                {"channel": channel, "error_type": "validation"},
            )
            return {"statusCode": 200, "body": "Validation error handled"}

        except Exception as e:
            # Unexpected errors
            log_exception(
                "bedrock_unexpected_error",
                {"channel": channel},
                e,
            )
            error_message = ERROR_MESSAGES["generic"]
            post_to_slack(channel, error_message, bot_token, thread_ts)
            log_info(
                "error_message_posted",
                {"channel": channel, "error_type": "generic"},
            )
            return {"statusCode": 200, "body": "Error handled"}

        # Post AI response to Slack
        try:
            post_to_slack(channel, ai_response, bot_token, thread_ts)
            log_info(
                "slack_post_success",
                {"channel": channel, "response_length": len(ai_response)},
            )
            # Return 202 Accepted for async operations (when invoked via API Gateway)
            # API Gateway Lambda proxy integration will return this status code to client
            return {"statusCode": 202, "body": "Accepted"}

        except Exception as e:
            # Error posting to Slack
            log_exception(
                "slack_post_failed",
                {"channel": channel},
                e,
            )
            # Log error but don't retry (async invocation)
            return {"statusCode": 500, "body": "Slack posting failed"}

    except Exception as e:
        # Top-level error handler - log full traceback for debugging
        log_exception(
            "unhandled_exception",
            {},
            e,
        )
        # Log error to CloudWatch
        # Note: Cannot post to Slack here because we don't have channel/token
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Internal error", "message": str(e)}),
        }
