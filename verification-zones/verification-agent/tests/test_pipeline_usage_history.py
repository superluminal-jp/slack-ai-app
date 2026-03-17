"""
Unit tests for pipeline.py usage-history integration.

TDD: These tests verify that save() is called at the correct pipeline exit points.
Run: python -m pytest tests/test_pipeline_usage_history.py -v
"""
import json
import os
import sys
from unittest.mock import MagicMock, patch, call

import pytest

# conftest.py adds src/ to sys.path and mocks fastapi/uvicorn
import pipeline
from usage_history import UsageRecord, PipelineResult

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _inner(
    text: str = "hello",
    channel: str = "C0001",
    team_id: str = "T0001",
    user_id: str = "U0001",
    attachments: list = None,
    correlation_id: str = "corr-test",
    bot_token: str = "xoxb-test",
) -> dict:
    return {
        "prompt": json.dumps({
            "correlation_id": correlation_id,
            "channel": channel,
            "text": text,
            "bot_token": bot_token,
            "team_id": team_id,
            "user_id": user_id,
            "attachments": attachments or [],
        })
    }


def _default_orch_result(response_text: str = "Agent response"):
    r = MagicMock()
    r.synthesized_text = response_text
    r.completion_status = "complete"
    r.file_artifact = None
    r.agents_called = ["file-creator"]
    r.turns_used = 1
    return r


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestSaveCalledAfterSuccessfulRun:
    """(a) save() called at end of successful pipeline run with correct input/output."""

    def test_save_called_with_user_text_and_agent_response(self):
        with (
            patch("pipeline.check_entity_existence"),
            patch("pipeline.authorize_request") as mock_auth,
            patch("pipeline.check_rate_limit", return_value=(True, {})),
            patch("pipeline.build_current_thread_context", return_value=None),
            patch("pipeline.resolve_slack_urls", side_effect=lambda t, *a, **kw: t),
            patch("pipeline.run_orchestration_loop", return_value=_default_orch_result()),
            patch("pipeline.send_slack_post_request"),
            patch("pipeline.get_all_cards", return_value={}),
            patch("pipeline._save_usage_record") as mock_save,
        ):
            mock_auth.return_value = MagicMock(authorized=True)
            result = pipeline.run(_inner(text="hello world"))

        assert json.loads(result)["status"] == "completed"
        assert mock_save.called, "save() must be called after successful run"

        record = mock_save.call_args[0][0]
        assert isinstance(record, UsageRecord)
        assert record.input_text == "hello world"
        assert record.output_text == "Agent response"


class TestSaveCalledOnAuthorizationRejection:
    """(b) save() called when pipeline rejects at authorization."""

    def test_save_called_with_authorization_false(self):
        with (
            patch("pipeline.check_entity_existence"),
            patch("pipeline.authorize_request") as mock_auth,
            patch("pipeline._save_usage_record") as mock_save,
        ):
            mock_auth.return_value = MagicMock(
                authorized=False,
                unauthorized_entities=["C0001"],
            )
            result = pipeline.run(_inner())

        assert json.loads(result)["status"] == "error"
        assert mock_save.called, "save() must be called on authorization rejection"

        record = mock_save.call_args[0][0]
        assert isinstance(record, UsageRecord)
        assert record.pipeline_result.authorization is False
        assert record.input_text == ""
        assert record.output_text == ""


class TestSaveCalledOnRateLimitRejection:
    """(c) save() called when pipeline rejects at rate limit."""

    def test_save_called_with_rate_limited_true(self):
        with (
            patch("pipeline.check_entity_existence"),
            patch("pipeline.authorize_request") as mock_auth,
            patch("pipeline.check_rate_limit", return_value=(False, {})),
            patch("pipeline._save_usage_record") as mock_save,
        ):
            mock_auth.return_value = MagicMock(authorized=True)
            result = pipeline.run(_inner())

        assert json.loads(result)["status"] == "error"
        assert mock_save.called, "save() must be called on rate limit rejection"

        record = mock_save.call_args[0][0]
        assert isinstance(record, UsageRecord)
        assert record.pipeline_result.rate_limited is True


class TestSaveFailOpenDoesNotAffectResponse:
    """(d) pipeline response is unaffected when _save_usage_record raises."""

    def test_pipeline_returns_completed_even_when_save_raises(self):
        with (
            patch("pipeline.check_entity_existence"),
            patch("pipeline.authorize_request") as mock_auth,
            patch("pipeline.check_rate_limit", return_value=(True, {})),
            patch("pipeline.build_current_thread_context", return_value=None),
            patch("pipeline.resolve_slack_urls", side_effect=lambda t, *a, **kw: t),
            patch("pipeline.run_orchestration_loop", return_value=_default_orch_result()),
            patch("pipeline.send_slack_post_request"),
            patch("pipeline.get_all_cards", return_value={}),
            patch("pipeline._save_usage_record", side_effect=Exception("Storage down")),
        ):
            mock_auth.return_value = MagicMock(authorized=True)
            result = pipeline.run(_inner())

        assert json.loads(result)["status"] == "completed", (
            "pipeline must return 'completed' even when _save_usage_record raises"
        )


class TestAttachmentKeysPassed:
    """(e) temp S3 keys from s3_file_manager passed to save() as attachment_keys."""

    def test_attachment_keys_included_in_record(self):
        expected_key = "attachments/corr-test/F001/file.pdf"

        with (
            patch("pipeline.check_entity_existence"),
            patch("pipeline.authorize_request") as mock_auth,
            patch("pipeline.check_rate_limit", return_value=(True, {})),
            patch("pipeline.build_current_thread_context", return_value=None),
            patch("pipeline.resolve_slack_urls", side_effect=lambda t, *a, **kw: t),
            patch("pipeline.run_orchestration_loop", return_value=_default_orch_result()),
            patch("pipeline.send_slack_post_request"),
            patch("pipeline.get_all_cards", return_value={}),
            patch("pipeline._get_slack_file_bytes", return_value=b"data"),
            patch("pipeline.upload_file_to_s3", return_value=expected_key),
            patch("pipeline.generate_presigned_url", return_value="https://presigned"),
            patch("pipeline.cleanup_request_files"),
            patch("pipeline._save_usage_record") as mock_save,
        ):
            mock_auth.return_value = MagicMock(authorized=True)
            result = pipeline.run(_inner(
                attachments=[{
                    "id": "F001",
                    "name": "file.pdf",
                    "mimetype": "application/pdf",
                    "size": 1000,
                }]
            ))

        assert json.loads(result)["status"] == "completed"
        assert mock_save.called

        record = mock_save.call_args[0][0]
        assert expected_key in record.attachment_keys, (
            f"expected {expected_key} in attachment_keys, got {record.attachment_keys}"
        )
