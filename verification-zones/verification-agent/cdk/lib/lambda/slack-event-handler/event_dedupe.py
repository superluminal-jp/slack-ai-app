"""
Event deduplication module using DynamoDB.

This module provides functions to check and mark Slack events as processed
to prevent duplicate processing across Lambda invocations.

Uses DynamoDB with conditional writes to prevent race conditions when
multiple Lambda instances process the same event simultaneously.
"""

import os
import time
from typing import Optional

import boto3
from botocore.exceptions import ClientError

# DynamoDB client (initialized on first use)
_dynamodb_client = None
_table_name = None

# TTL for event records (1 hour in seconds)
CACHE_TTL_SECONDS = 3600


def _get_dynamodb_client():
    """Get or create DynamoDB client (singleton pattern)."""
    global _dynamodb_client
    if _dynamodb_client is None:
        aws_region = os.environ.get("AWS_REGION_NAME", "ap-northeast-1")
        _dynamodb_client = boto3.client("dynamodb", region_name=aws_region)
    return _dynamodb_client


def _get_table_name() -> str:
    """Get DynamoDB table name from environment variable."""
    global _table_name
    if _table_name is None:
        _table_name = os.environ.get("DEDUPE_TABLE_NAME")
        if not _table_name:
            raise ValueError(
                "DEDUPE_TABLE_NAME environment variable is required for event deduplication"
            )
    return _table_name


def is_duplicate_event(event_id: str) -> bool:
    """
    Check if an event has already been processed.

    Args:
        event_id: Slack event ID (e.g., "Ev0A0EKZ56DR")

    Returns:
        bool: True if event was already processed, False otherwise

    Raises:
        ClientError: If DynamoDB operation fails
        ValueError: If event_id is empty or DEDUPE_TABLE_NAME is not set

    Example:
        >>> if is_duplicate_event("Ev0A0EKZ56DR"):
        ...     print("Event already processed")
        ... else:
        ...     print("New event")
    """
    if not event_id or not event_id.strip():
        raise ValueError("event_id cannot be empty")

    table_name = _get_table_name()
    dynamodb = _get_dynamodb_client()

    try:
        response = dynamodb.get_item(
            TableName=table_name,
            Key={"event_id": {"S": event_id}},
        )

        # If item exists, event was already processed
        return "Item" in response

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code == "ResourceNotFoundException":
            # Table doesn't exist yet (shouldn't happen in production)
            print(f"Warning: Dedupe table not found: {table_name}")
            return False
        # Re-raise other errors
        print(f"DynamoDB error checking duplicate: {error_code}")
        raise


def mark_event_processed(event_id: str) -> bool:
    """
    Mark an event as processed in DynamoDB.

    Uses conditional write to prevent race conditions. If the event
    already exists, returns False (indicating it was a duplicate).
    Otherwise, creates the record and returns True.

    Args:
        event_id: Slack event ID (e.g., "Ev0A0EKZ56DR")

    Returns:
        bool: True if event was successfully marked (new event),
              False if event already existed (duplicate)

    Raises:
        ClientError: If DynamoDB operation fails
        ValueError: If event_id is empty or DEDUPE_TABLE_NAME is not set

    Example:
        >>> if mark_event_processed("Ev0A0EKZ56DR"):
        ...     print("Event marked as processed")
        ... else:
        ...     print("Event was already processed (duplicate)")
    """
    if not event_id or not event_id.strip():
        raise ValueError("event_id cannot be empty")

    table_name = _get_table_name()
    dynamodb = _get_dynamodb_client()

    # Calculate TTL (current time + TTL duration)
    ttl_timestamp = int(time.time()) + CACHE_TTL_SECONDS

    try:
        # Use conditional write: only insert if event_id doesn't exist
        # This prevents race conditions when multiple Lambdas process simultaneously
        dynamodb.put_item(
            TableName=table_name,
            Item={
                "event_id": {"S": event_id},
                "ttl": {"N": str(ttl_timestamp)},
                "processed_at": {"N": str(int(time.time()))},
            },
            ConditionExpression="attribute_not_exists(event_id)",
        )

        # Successfully marked as processed (new event)
        return True

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code == "ConditionalCheckFailedException":
            # Event already exists (duplicate)
            return False
        elif error_code == "ResourceNotFoundException":
            # Table doesn't exist yet (shouldn't happen in production)
            print(f"Warning: Dedupe table not found: {table_name}")
            # Return True to allow processing (fail open)
            return True
        else:
            # Other DynamoDB errors
            print(f"DynamoDB error marking event: {error_code}")
            # Return True to allow processing (fail open - better than blocking)
            return True

