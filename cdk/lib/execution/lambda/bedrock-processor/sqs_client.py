"""
SQS client for sending execution responses to verification zone.

This module provides functionality to send ExecutionResponse messages
to the SQS queue in the verification zone.
"""

import json
import os
from typing import Dict, Any, Optional
import boto3
from botocore.exceptions import ClientError, BotoCoreError
from logger import log_info, log_error, log_exception, log_warn


def send_response_to_queue(
    queue_url: str,
    response: Dict[str, Any],
    max_retries: int = 2,
) -> bool:
    """
    Send ExecutionResponse to SQS queue.

    Args:
        queue_url: SQS queue URL (from environment variable or stack output)
        response: ExecutionResponse dictionary (from response_formatter)
        max_retries: Maximum number of retry attempts for transient errors

    Returns:
        True if message was sent successfully, False otherwise

    Raises:
        ValueError: If queue_url is invalid or response format is invalid
        ClientError: If SQS API call fails after retries
    """
    if not queue_url or not isinstance(queue_url, str) or not queue_url.strip():
        raise ValueError("queue_url must be a non-empty string")

    if not isinstance(response, dict):
        raise ValueError("response must be a dictionary")

    # Validate response format
    status = response.get("status")
    if status not in ["success", "error"]:
        raise ValueError(f"Invalid response status: {status}. Must be 'success' or 'error'")

    # Create SQS client
    sqs_client = boto3.client("sqs", region_name=os.environ.get("AWS_REGION_NAME", "ap-northeast-1"))

    # Prepare message body
    message_body = json.dumps(response)

    # Prepare message attributes (optional, for correlation ID tracking)
    message_attributes: Dict[str, Dict[str, str]] = {}
    if "correlation_id" in response and response["correlation_id"]:
        message_attributes["correlation_id"] = {
            "StringValue": response["correlation_id"],
            "DataType": "String",
        }

    last_error: Optional[Exception] = None

    for attempt in range(max_retries + 1):
        try:
            # Send message to SQS
            response_sqs = sqs_client.send_message(
                QueueUrl=queue_url,
                MessageBody=message_body,
                MessageAttributes=message_attributes if message_attributes else None,
            )

            log_info(
                "sqs_message_sent",
                {
                    "queue_url": queue_url,
                    "message_id": response_sqs.get("MessageId"),
                    "status": status,
                    "channel": response.get("channel"),
                    "correlation_id": response.get("correlation_id"),
                },
            )
            return True

        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_message = e.response["Error"].get("Message", "")

            # Check if error is retryable
            if error_code in ["ServiceUnavailable", "Throttling", "InternalError"]:
                if attempt < max_retries:
                    log_warn(
                        "sqs_send_retry",
                        {
                            "queue_url": queue_url,
                            "attempt": attempt + 1,
                            "max_retries": max_retries,
                            "error_code": error_code,
                        },
                    )
                    last_error = e
                    continue
                else:
                    # Max retries exceeded
                    log_error(
                        "sqs_send_failed_max_retries",
                        {
                            "queue_url": queue_url,
                            "error_code": error_code,
                            "error_message": error_message,
                            "attempts": max_retries + 1,
                        },
                    )
                    raise

            # Non-retryable errors
            log_error(
                "sqs_send_failed",
                {
                    "queue_url": queue_url,
                    "error_code": error_code,
                    "error_message": error_message,
                    "channel": response.get("channel"),
                },
            )
            raise

        except BotoCoreError as e:
            # Network or other boto3 errors
            if attempt < max_retries:
                log_warn(
                    "sqs_send_retry",
                    {
                        "queue_url": queue_url,
                        "attempt": attempt + 1,
                        "max_retries": max_retries,
                        "error": str(e),
                    },
                )
                last_error = e
                continue
            else:
                log_error(
                    "sqs_send_failed_max_retries",
                    {
                        "queue_url": queue_url,
                        "error": str(e),
                        "attempts": max_retries + 1,
                    },
                )
                raise

        except Exception as e:
            # Unexpected errors
            log_exception(
                "sqs_send_unexpected_error",
                {
                    "queue_url": queue_url,
                    "channel": response.get("channel"),
                },
                e,
            )
            raise

    # Should not reach here, but just in case
    if last_error:
        raise last_error
    return False

