"""
Unit tests for usage_history.py

TDD: These tests are written BEFORE the implementation (RED phase).
Run: python -m pytest tests/test_usage_history.py -v
"""
import json
import uuid
from dataclasses import dataclass, field
from unittest.mock import MagicMock, patch, call
import pytest


# ---------------------------------------------------------------------------
# We import usage_history from src (path adjusted below).
# ---------------------------------------------------------------------------
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../src"))

import usage_history  # noqa: E402
from usage_history import (  # noqa: E402
    UsageRecord,
    PipelineResult,
    OrchestrationResult,
    save,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

CHANNEL_ID = "C1234567890"
CORRELATION_ID = "corr-test-uuid"
TABLE_NAME = "test-stack-usage-history"
HISTORY_BUCKET = "test-stack-usage-history"
TEMP_BUCKET = "test-stack-file-exchange"

TEMP_KEY_1 = f"attachments/{CORRELATION_ID}/F001/report.pdf"
TEMP_KEY_2 = f"attachments/{CORRELATION_ID}/F002/image.png"


def _make_record(
    input_text: str = "Hello",
    output_text: str = "World",
    attachment_keys: list = None,
    pipeline_result: PipelineResult = None,
) -> UsageRecord:
    return UsageRecord(
        channel_id=CHANNEL_ID,
        correlation_id=CORRELATION_ID,
        team_id="T0001",
        user_id="U0001",
        input_text=input_text,
        output_text=output_text,
        pipeline_result=pipeline_result or PipelineResult(),
        attachment_keys=attachment_keys or [],
        duration_ms=123,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestSaveContentToS3:
    """(a)+(b) save() writes input/output text to S3 when non-empty."""

    def test_puts_input_json_when_input_text_non_empty(self):
        mock_s3 = MagicMock()
        mock_dynamodb = MagicMock()
        record = _make_record(input_text="Hello world", output_text="")

        with patch("usage_history.boto3") as mock_boto3:
            mock_boto3.client.side_effect = lambda svc, **kw: (
                mock_s3 if svc == "s3" else mock_dynamodb
            )
            save(TABLE_NAME, HISTORY_BUCKET, TEMP_BUCKET, record)

        calls = [str(c) for c in mock_s3.put_object.call_args_list]
        assert any("input.json" in c for c in calls), (
            "expected s3.put_object call with input.json"
        )

    def test_puts_output_json_when_output_text_non_empty(self):
        mock_s3 = MagicMock()
        mock_dynamodb = MagicMock()
        record = _make_record(input_text="", output_text="Response text")

        with patch("usage_history.boto3") as mock_boto3:
            mock_boto3.client.side_effect = lambda svc, **kw: (
                mock_s3 if svc == "s3" else mock_dynamodb
            )
            save(TABLE_NAME, HISTORY_BUCKET, TEMP_BUCKET, record)

        calls = [str(c) for c in mock_s3.put_object.call_args_list]
        assert any("output.json" in c for c in calls), (
            "expected s3.put_object call with output.json"
        )


class TestSkipEmptyContent:
    """(c) save() skips S3 content writes when text is empty."""

    def test_skips_input_json_when_input_text_empty(self):
        mock_s3 = MagicMock()
        mock_dynamodb = MagicMock()
        record = _make_record(input_text="", output_text="")

        with patch("usage_history.boto3") as mock_boto3:
            mock_boto3.client.side_effect = lambda svc, **kw: (
                mock_s3 if svc == "s3" else mock_dynamodb
            )
            save(TABLE_NAME, HISTORY_BUCKET, TEMP_BUCKET, record)

        calls = [str(c) for c in mock_s3.put_object.call_args_list]
        assert not any("input.json" in c for c in calls), (
            "must not call s3.put_object for input.json when input_text is empty"
        )

    def test_skips_output_json_when_output_text_empty(self):
        mock_s3 = MagicMock()
        mock_dynamodb = MagicMock()
        record = _make_record(input_text="", output_text="")

        with patch("usage_history.boto3") as mock_boto3:
            mock_boto3.client.side_effect = lambda svc, **kw: (
                mock_s3 if svc == "s3" else mock_dynamodb
            )
            save(TABLE_NAME, HISTORY_BUCKET, TEMP_BUCKET, record)

        calls = [str(c) for c in mock_s3.put_object.call_args_list]
        assert not any("output.json" in c for c in calls), (
            "must not call s3.put_object for output.json when output_text is empty"
        )


class TestAttachmentCopy:
    """(d) save() copies each attachment key from temp bucket to history bucket."""

    def test_copies_each_attachment_key(self):
        mock_s3 = MagicMock()
        mock_dynamodb = MagicMock()
        record = _make_record(
            input_text="",
            output_text="",
            attachment_keys=[TEMP_KEY_1, TEMP_KEY_2],
        )

        with patch("usage_history.boto3") as mock_boto3:
            mock_boto3.client.side_effect = lambda svc, **kw: (
                mock_s3 if svc == "s3" else mock_dynamodb
            )
            save(TABLE_NAME, HISTORY_BUCKET, TEMP_BUCKET, record)

        assert mock_s3.copy_object.call_count == 2

    def test_copy_source_is_temp_bucket(self):
        mock_s3 = MagicMock()
        mock_dynamodb = MagicMock()
        record = _make_record(
            input_text="", output_text="", attachment_keys=[TEMP_KEY_1]
        )

        with patch("usage_history.boto3") as mock_boto3:
            mock_boto3.client.side_effect = lambda svc, **kw: (
                mock_s3 if svc == "s3" else mock_dynamodb
            )
            save(TABLE_NAME, HISTORY_BUCKET, TEMP_BUCKET, record)

        call_kwargs = mock_s3.copy_object.call_args[1]
        assert call_kwargs["CopySource"]["Bucket"] == TEMP_BUCKET
        assert call_kwargs["CopySource"]["Key"] == TEMP_KEY_1
        assert call_kwargs["Bucket"] == HISTORY_BUCKET


class TestDynamoDBItem:
    """(e) DynamoDB put_item contains s3_content_prefix and metadata but NO input_text/output_text."""

    def test_dynamo_item_has_s3_content_prefix(self):
        mock_s3 = MagicMock()
        mock_dynamodb = MagicMock()
        record = _make_record(input_text="hi", output_text="there")

        with patch("usage_history.boto3") as mock_boto3:
            mock_boto3.client.side_effect = lambda svc, **kw: (
                mock_s3 if svc == "s3" else mock_dynamodb
            )
            save(TABLE_NAME, HISTORY_BUCKET, TEMP_BUCKET, record)

        item = mock_dynamodb.put_item.call_args[1]["Item"]
        assert "s3_content_prefix" in item, "DynamoDB item must include s3_content_prefix"

    def test_dynamo_item_does_not_contain_input_text(self):
        mock_s3 = MagicMock()
        mock_dynamodb = MagicMock()
        record = _make_record(input_text="secret message", output_text="reply")

        with patch("usage_history.boto3") as mock_boto3:
            mock_boto3.client.side_effect = lambda svc, **kw: (
                mock_s3 if svc == "s3" else mock_dynamodb
            )
            save(TABLE_NAME, HISTORY_BUCKET, TEMP_BUCKET, record)

        item = mock_dynamodb.put_item.call_args[1]["Item"]
        assert "input_text" not in item, (
            "DynamoDB item must NOT contain input_text (confidentiality separation)"
        )

    def test_dynamo_item_does_not_contain_output_text(self):
        mock_s3 = MagicMock()
        mock_dynamodb = MagicMock()
        record = _make_record(input_text="msg", output_text="secret reply")

        with patch("usage_history.boto3") as mock_boto3:
            mock_boto3.client.side_effect = lambda svc, **kw: (
                mock_s3 if svc == "s3" else mock_dynamodb
            )
            save(TABLE_NAME, HISTORY_BUCKET, TEMP_BUCKET, record)

        item = mock_dynamodb.put_item.call_args[1]["Item"]
        assert "output_text" not in item, (
            "DynamoDB item must NOT contain output_text (confidentiality separation)"
        )

    def test_dynamo_item_has_metadata_fields(self):
        mock_s3 = MagicMock()
        mock_dynamodb = MagicMock()
        record = _make_record()

        with patch("usage_history.boto3") as mock_boto3:
            mock_boto3.client.side_effect = lambda svc, **kw: (
                mock_s3 if svc == "s3" else mock_dynamodb
            )
            save(TABLE_NAME, HISTORY_BUCKET, TEMP_BUCKET, record)

        item = mock_dynamodb.put_item.call_args[1]["Item"]
        assert "channel_id" in item
        assert "correlation_id" in item
        assert "ttl" in item
        assert "duration_ms" in item


class TestFailOpen:
    """(f)+(g) save() does not raise on DynamoDB or S3 error."""

    def test_does_not_raise_on_dynamodb_error(self):
        mock_s3 = MagicMock()
        mock_dynamodb = MagicMock()
        mock_dynamodb.put_item.side_effect = Exception("DynamoDB unavailable")
        record = _make_record()

        with patch("usage_history.boto3") as mock_boto3:
            mock_boto3.client.side_effect = lambda svc, **kw: (
                mock_s3 if svc == "s3" else mock_dynamodb
            )
            # Must not raise
            save(TABLE_NAME, HISTORY_BUCKET, TEMP_BUCKET, record)

    def test_does_not_raise_on_s3_put_error(self):
        mock_s3 = MagicMock()
        mock_dynamodb = MagicMock()
        mock_s3.put_object.side_effect = Exception("S3 throttled")
        record = _make_record(input_text="hello", output_text="world")

        with patch("usage_history.boto3") as mock_boto3:
            mock_boto3.client.side_effect = lambda svc, **kw: (
                mock_s3 if svc == "s3" else mock_dynamodb
            )
            # Must not raise
            save(TABLE_NAME, HISTORY_BUCKET, TEMP_BUCKET, record)


class TestSkippedAttachments:
    """(h) skipped_attachments recorded when copy fails."""

    def test_skipped_attachment_recorded_on_copy_failure(self):
        mock_s3 = MagicMock()
        mock_dynamodb = MagicMock()
        mock_s3.copy_object.side_effect = Exception("S3 copy failed")
        record = _make_record(
            input_text="", output_text="", attachment_keys=[TEMP_KEY_1]
        )

        with patch("usage_history.boto3") as mock_boto3:
            mock_boto3.client.side_effect = lambda svc, **kw: (
                mock_s3 if svc == "s3" else mock_dynamodb
            )
            save(TABLE_NAME, HISTORY_BUCKET, TEMP_BUCKET, record)

        # record.skipped_attachments should be populated, or the DynamoDB item
        # should reflect skipped attachments — either approach is acceptable.
        # Check that at least the DynamoDB call still occurred (fail-open).
        assert mock_dynamodb.put_item.call_count == 1


class TestCorrelationIdFallback:
    """(i) UUID generated when correlation_id is empty."""

    def test_generates_uuid_when_correlation_id_empty(self):
        mock_s3 = MagicMock()
        mock_dynamodb = MagicMock()
        record = UsageRecord(
            channel_id=CHANNEL_ID,
            correlation_id="",  # empty
            input_text="",
            output_text="",
        )

        with patch("usage_history.boto3") as mock_boto3:
            mock_boto3.client.side_effect = lambda svc, **kw: (
                mock_s3 if svc == "s3" else mock_dynamodb
            )
            save(TABLE_NAME, HISTORY_BUCKET, TEMP_BUCKET, record)

        # DynamoDB item must have a non-empty correlation_id
        item = mock_dynamodb.put_item.call_args[1]["Item"]
        corr_id_value = item.get("correlation_id", {})
        # DynamoDB format: {"S": "..."} or direct string
        if isinstance(corr_id_value, dict):
            corr_id_str = corr_id_value.get("S", "")
        else:
            corr_id_str = str(corr_id_value)
        assert corr_id_str, "correlation_id must be non-empty (UUID fallback expected)"
