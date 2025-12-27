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

from bedrock_client_converse import invoke_bedrock
from attachment_processor import process_attachments
from response_formatter import format_success_response, format_error_response
from sqs_client import send_response_to_queue
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
                        # Send error response to SQS queue
                        try:
                            error_response = format_error_response(
                                channel=channel,
                                error_code="unsupported_file_type",
                                error_message=error_message,
                                bot_token=bot_token,
                                thread_ts=thread_ts,
                                correlation_id=correlation_id,
                            )
                            queue_url = os.environ.get("EXECUTION_RESPONSE_QUEUE_URL", "")
                            if queue_url:
                                send_response_to_queue(queue_url, error_response)
                                log_info(
                                    "error_response_sent_to_sqs",
                                    {
                                        "channel": channel,
                                        "error_type": "unsupported_file_type",
                                        "skipped_count": len(skipped_attachments),
                                    },
                                )
                            else:
                                log_error(
                                    "sqs_queue_url_missing",
                                    {
                                        "channel": channel,
                                        "error_type": "unsupported_file_type",
                                    },
                                )
                        except Exception as sqs_error:
                            log_exception(
                                "sqs_send_error",
                                {"channel": channel, "error_type": "unsupported_file_type"},
                                sqs_error,
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

                        # Send error response to SQS queue
                        try:
                            error_response = format_error_response(
                                channel=channel,
                                error_code="image_download_failed",
                                error_message=error_message,
                                bot_token=bot_token,
                                thread_ts=thread_ts,
                                correlation_id=correlation_id,
                            )
                            queue_url = os.environ.get("EXECUTION_RESPONSE_QUEUE_URL", "")
                            if queue_url:
                                send_response_to_queue(queue_url, error_response)
                                log_info(
                                    "error_response_sent_to_sqs",
                                    {
                                        "channel": channel,
                                        "error_type": "image_attachment_failed",
                                        "primary_error_code": (
                                            error_codes[0] if error_codes else "unknown"
                                        ),
                                    },
                                )
                            else:
                                log_error(
                                    "sqs_queue_url_missing",
                                    {
                                        "channel": channel,
                                        "error_type": "image_attachment_failed",
                                    },
                                )
                        except Exception as sqs_error:
                            log_exception(
                                "sqs_send_error",
                                {"channel": channel, "error_type": "image_attachment_failed"},
                                sqs_error,
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
                            # Send error response to SQS queue
                            try:
                                error_response = format_error_response(
                                    channel=channel,
                                    error_code=primary_error_code,
                                    error_message=error_message,
                                    bot_token=bot_token,
                                    thread_ts=thread_ts,
                                    correlation_id=correlation_id,
                                )
                                queue_url = os.environ.get("EXECUTION_RESPONSE_QUEUE_URL", "")
                                if queue_url:
                                    send_response_to_queue(queue_url, error_response)
                                    log_info(
                                        "error_response_sent_to_sqs",
                                        {
                                            "channel": channel,
                                            "error_type": "attachment_failed",
                                            "primary_error_code": primary_error_code,
                                        },
                                    )
                                else:
                                    log_error(
                                        "sqs_queue_url_missing",
                                        {
                                            "channel": channel,
                                            "error_type": "attachment_failed",
                                        },
                                    )
                            except Exception as sqs_error:
                                log_exception(
                                    "sqs_send_error",
                                    {"channel": channel, "error_type": "attachment_failed"},
                                    sqs_error,
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

        # Thread history retrieval removed - execution zone no longer accesses Slack API
        # TODO: Move thread history retrieval to verification zone and pass as part of request payload
        conversation_history = None

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
            # Send error response to SQS queue
            try:
                error_response = format_error_response(
                    channel=channel,
                    error_code="bedrock_timeout",
                    error_message=error_message,
                    bot_token=bot_token,
                    thread_ts=thread_ts,
                    correlation_id=correlation_id,
                )
                queue_url = os.environ.get("EXECUTION_RESPONSE_QUEUE_URL", "")
                if queue_url:
                    send_response_to_queue(queue_url, error_response)
                    log_info(
                        "error_response_sent_to_sqs",
                        {"channel": channel, "error_type": "timeout"},
                    )
                else:
                    log_error(
                        "sqs_queue_url_missing",
                        {"channel": channel, "error_type": "timeout"},
                    )
            except Exception as sqs_error:
                log_exception(
                    "sqs_send_error",
                    {"channel": channel, "error_type": "timeout"},
                    sqs_error,
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

            # Send error response to SQS queue
            try:
                error_response = format_error_response(
                    channel=channel,
                    error_code=error_code.lower().replace("exception", ""),
                    error_message=error_message,
                    bot_token=bot_token,
                    thread_ts=thread_ts,
                    correlation_id=correlation_id,
                )
                queue_url = os.environ.get("EXECUTION_RESPONSE_QUEUE_URL", "")
                if queue_url:
                    send_response_to_queue(queue_url, error_response)
                    log_info(
                        "error_response_sent_to_sqs",
                        {"channel": channel, "error_code": error_code},
                    )
                else:
                    log_error(
                        "sqs_queue_url_missing",
                        {"channel": channel, "error_code": error_code},
                    )
            except Exception as sqs_error:
                log_exception(
                    "sqs_send_error",
                    {"channel": channel, "error_code": error_code},
                    sqs_error,
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
            # Send error response to SQS queue
            try:
                error_response = format_error_response(
                    channel=channel,
                    error_code="invalid_response",
                    error_message=error_message,
                    bot_token=bot_token,
                    thread_ts=thread_ts,
                    correlation_id=correlation_id,
                )
                queue_url = os.environ.get("EXECUTION_RESPONSE_QUEUE_URL", "")
                if queue_url:
                    send_response_to_queue(queue_url, error_response)
                    log_info(
                        "error_response_sent_to_sqs",
                        {"channel": channel, "error_type": "validation"},
                    )
                else:
                    log_error(
                        "sqs_queue_url_missing",
                        {"channel": channel, "error_type": "validation"},
                    )
            except Exception as sqs_error:
                log_exception(
                    "sqs_send_error",
                    {"channel": channel, "error_type": "validation"},
                    sqs_error,
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
            # Send error response to SQS queue
            try:
                error_response = format_error_response(
                    channel=channel,
                    error_code="generic",
                    error_message=error_message,
                    bot_token=bot_token,
                    thread_ts=thread_ts,
                    correlation_id=correlation_id,
                )
                queue_url = os.environ.get("EXECUTION_RESPONSE_QUEUE_URL", "")
                if queue_url:
                    send_response_to_queue(queue_url, error_response)
                    log_info(
                        "error_response_sent_to_sqs",
                        {"channel": channel, "error_type": "generic"},
                    )
                else:
                    log_error(
                        "sqs_queue_url_missing",
                        {"channel": channel, "error_type": "generic"},
                    )
            except Exception as sqs_error:
                log_exception(
                    "sqs_send_error",
                    {"channel": channel, "error_type": "generic"},
                    sqs_error,
                )
            return {"statusCode": 200, "body": "Error handled"}

        # Send AI response to SQS queue for verification zone to post to Slack
        try:
            success_response = format_success_response(
                channel=channel,
                response_text=ai_response,
                bot_token=bot_token,
                thread_ts=thread_ts,
                correlation_id=correlation_id,
            )
            queue_url = os.environ.get("EXECUTION_RESPONSE_QUEUE_URL", "")
            if queue_url:
                send_response_to_queue(queue_url, success_response)
                log_info(
                    "success_response_sent_to_sqs",
                    {"channel": channel, "response_length": len(ai_response)},
                )
            else:
                log_error(
                    "sqs_queue_url_missing",
                    {"channel": channel, "response_length": len(ai_response)},
                )
                return {"statusCode": 500, "body": "SQS queue URL not configured"}

            # Return 202 Accepted for async operations (when invoked via API Gateway)
            # API Gateway Lambda proxy integration will return this status code to client
            return {"statusCode": 202, "body": "Accepted"}

        except Exception as e:
            # Error sending to SQS
            log_exception(
                "sqs_send_failed",
                {"channel": channel},
                e,
            )
            # Log error but don't retry (async invocation)
            return {"statusCode": 500, "body": "SQS send failed"}

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
