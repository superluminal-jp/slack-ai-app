"""
Unit tests for pipeline S3 integration (US4 Secure Cross-Zone File Transfer, 028).

Tests:
- Slack file download + S3 upload flow (mocked)
- Pre-signed URL generation and inclusion in execution payload
- S3 cleanup after successful response and on error (try/finally)
- Payload does not contain bot_token for file operations; contains presigned_url per contract
- 028: Large file artifact (> 200KB) routed via S3 (upload_generated_file_to_s3, build_file_artifact_s3)
"""

import base64
import json
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture(autouse=True)
def mock_routing_defaults():
    """Keep tests focused on pipeline behavior, not router selection outcomes."""
    with patch("pipeline.route_request", return_value="file-creator"), patch(
        "pipeline.get_agent_arn",
        return_value="arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/file-creator",
    ):
        yield


def _payload(
    correlation_id="corr-001",
    channel="C01234",
    text="hello",
    bot_token="xoxb-test",
    thread_ts="123.456",
    team_id="T1",
    user_id="U1",
    attachments=None,
):
    return {
        "correlation_id": correlation_id,
        "channel": channel,
        "text": text,
        "bot_token": bot_token,
        "thread_ts": thread_ts,
        "team_id": team_id,
        "user_id": user_id,
        "attachments": attachments or [],
    }


class TestPipelineS3Integration:
    """Pipeline must enrich attachments with presigned_url and cleanup S3."""

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_execution_payload_contains_presigned_url_when_attachments_enriched(
        self, mock_existence, mock_auth, mock_invoke, mock_slack_post
    ):
        """When pipeline enriches attachments, payload to execution agent must have presigned_url per contract."""
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])
        mock_invoke.return_value = json.dumps({"status": "success", "response_text": "OK"})
        mock_slack_post.return_value = None

        with patch("pipeline.check_rate_limit") as mock_rate:
            mock_rate.return_value = (True, None)
            with patch.dict(os.environ, {"FILE_EXCHANGE_BUCKET": "test-bucket"}, clear=False):
                with patch("pipeline.upload_file_to_s3") as mock_upload:
                    mock_upload.return_value = "attachments/corr-001/F1/doc.pdf"
                    with patch("pipeline.generate_presigned_url") as mock_presign:
                        mock_presign.return_value = "https://bucket.s3.amazonaws.com/key?X-Amz-Signature=..."
                        with patch("pipeline.cleanup_request_files") as mock_cleanup:
                            with patch("pipeline._get_slack_file_bytes") as mock_slack_bytes:
                                mock_slack_bytes.return_value = b"file bytes"

                                from pipeline import run

                                payload = _payload(
                                    attachments=[
                                        {
                                            "id": "F1",
                                            "name": "doc.pdf",
                                            "mimetype": "application/pdf",
                                            "size": 9,
                                            "url_private_download": "https://files.slack.com/old",
                                        },
                                    ],
                                )
                                run({"prompt": json.dumps(payload)})

                                # Execution payload must contain attachments with presigned_url
                                invoke_call = mock_invoke.call_args[0][0]
                                assert "attachments" in invoke_call
                                assert len(invoke_call["attachments"]) == 1
                                assert invoke_call["attachments"][0].get("presigned_url") == "https://bucket.s3.amazonaws.com/key?X-Amz-Signature=..."
                                assert invoke_call["attachments"][0].get("id") == "F1"
                                assert invoke_call["attachments"][0].get("name") == "doc.pdf"
                                assert invoke_call["attachments"][0].get("mimetype") == "application/pdf"
                                assert invoke_call["attachments"][0].get("size") == 9
                                # Per contract: bot_token required for response formatting (success/error)
                                assert invoke_call.get("bot_token") == "xoxb-test"

                                mock_cleanup.assert_called_once_with("corr-001")

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_s3_cleanup_called_after_success(self, mock_existence, mock_auth, mock_invoke, mock_slack_post):
        """cleanup_request_files must be called after successful execution response."""
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])
        mock_invoke.return_value = json.dumps({"status": "success", "response_text": "Done"})
        mock_slack_post.return_value = None

        with patch("pipeline.check_rate_limit") as mock_rate:
            mock_rate.return_value = (True, None)
            with patch("pipeline.cleanup_request_files") as mock_cleanup:
                with patch("pipeline.upload_file_to_s3"), patch("pipeline.generate_presigned_url"):
                    with patch("pipeline._get_slack_file_bytes") as mock_slack_bytes:
                        mock_slack_bytes.return_value = b"x" * 5

                        from pipeline import run

                        run({"prompt": json.dumps(_payload(attachments=[
                            {"id": "F1", "name": "f.txt", "mimetype": "text/plain", "size": 5, "url_private_download": "u"},
                        ]))})

                        mock_cleanup.assert_called_once()

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_s3_cleanup_called_on_execution_error(self, mock_existence, mock_auth, mock_invoke, mock_slack_post):
        """cleanup_request_files must be called even when execution agent raises (try/finally)."""
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])
        mock_invoke.side_effect = RuntimeError("Execution agent failed")
        mock_slack_post.return_value = None

        with patch("pipeline.check_rate_limit") as mock_rate:
            mock_rate.return_value = (True, None)
            with patch("pipeline.cleanup_request_files") as mock_cleanup:
                with patch("pipeline.upload_file_to_s3"), patch("pipeline.generate_presigned_url"):
                    with patch("pipeline._get_slack_file_bytes") as mock_slack_bytes:
                        mock_slack_bytes.return_value = b"x" * 5

                        from pipeline import run

                        run({"prompt": json.dumps(_payload(attachments=[
                            {"id": "F1", "name": "f.txt", "mimetype": "text/plain", "size": 5, "url_private_download": "u"},
                        ]))})

                        # Cleanup must be called despite exception
                        mock_cleanup.assert_called_once()


class TestPipelineMultipleAttachmentsUs3:
    """Tests for batch file upload (US3): multiple attachments, S3, cleanup."""

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_multiple_attachments_uploaded_to_s3_same_correlation_id(
        self, mock_existence, mock_auth, mock_invoke, mock_slack_post
    ):
        """Multiple attachments (2-5) must all be uploaded to S3 under same correlation_id."""
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])
        mock_invoke.return_value = json.dumps({"status": "success", "response_text": "OK"})
        mock_slack_post.return_value = None

        with patch("pipeline.check_rate_limit") as mock_rate:
            mock_rate.return_value = (True, None)
            with patch.dict(os.environ, {"FILE_EXCHANGE_BUCKET": "test-bucket"}, clear=False):
                with patch("pipeline.upload_file_to_s3") as mock_upload:
                    with patch("pipeline.generate_presigned_url") as mock_presign:
                        with patch("pipeline.cleanup_request_files") as mock_cleanup:
                            with patch("pipeline._get_slack_file_bytes") as mock_slack_bytes:
                                mock_slack_bytes.return_value = b"file content"
                                mock_upload.side_effect = [
                                    "attachments/corr-multi/F1/a.pdf",
                                    "attachments/corr-multi/F2/b.pdf",
                                    "attachments/corr-multi/F3/c.pdf",
                                ]
                                mock_presign.side_effect = [
                                    "https://bucket.s3.amazonaws.com/k1?sig=1",
                                    "https://bucket.s3.amazonaws.com/k2?sig=2",
                                    "https://bucket.s3.amazonaws.com/k3?sig=3",
                                ]

                                from pipeline import run

                                payload = _payload(
                                    correlation_id="corr-multi",
                                    attachments=[
                                        {"id": "F1", "name": "a.pdf", "mimetype": "application/pdf", "size": 10, "url_private_download": "u1"},
                                        {"id": "F2", "name": "b.pdf", "mimetype": "application/pdf", "size": 10, "url_private_download": "u2"},
                                        {"id": "F3", "name": "c.pdf", "mimetype": "application/pdf", "size": 10, "url_private_download": "u3"},
                                    ],
                                )
                                run({"prompt": json.dumps(payload)})

                                assert mock_upload.call_count == 3
                                for call in mock_upload.call_args_list:
                                    args = call[0]
                                    assert args[1] == "corr-multi"
                                assert mock_invoke.call_count == 1
                                invoke_payload = mock_invoke.call_args[0][0]
                                assert len(invoke_payload["attachments"]) == 3
                                mock_cleanup.assert_called_once_with("corr-multi")

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_each_attachment_gets_unique_presigned_url(
        self, mock_existence, mock_auth, mock_invoke, mock_slack_post
    ):
        """Each attachment must get a unique pre-signed URL."""
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])
        mock_invoke.return_value = json.dumps({"status": "success", "response_text": "OK"})
        mock_slack_post.return_value = None

        with patch("pipeline.check_rate_limit") as mock_rate:
            mock_rate.return_value = (True, None)
            with patch.dict(os.environ, {"FILE_EXCHANGE_BUCKET": "test-bucket"}, clear=False):
                with patch("pipeline.upload_file_to_s3") as mock_upload:
                    with patch("pipeline.generate_presigned_url") as mock_presign:
                        with patch("pipeline.cleanup_request_files"):
                            with patch("pipeline._get_slack_file_bytes") as mock_slack_bytes:
                                mock_slack_bytes.return_value = b"x"
                                mock_upload.side_effect = ["att/corr/F1/f1", "att/corr/F2/f2"]
                                mock_presign.side_effect = [
                                    "https://s3.example.com/key1?sig=a",
                                    "https://s3.example.com/key2?sig=b",
                                ]

                                from pipeline import run

                                run({"prompt": json.dumps(_payload(attachments=[
                                    {"id": "F1", "name": "f1.pdf", "mimetype": "application/pdf", "size": 1, "url_private_download": "u1"},
                                    {"id": "F2", "name": "f2.pdf", "mimetype": "application/pdf", "size": 1, "url_private_download": "u2"},
                                ]))})

                                urls = [a.get("presigned_url") for a in mock_invoke.call_args[0][0]["attachments"]]
                                assert len(urls) == 2
                                assert urls[0] != urls[1]

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_batch_cleanup_deletes_all_for_correlation_id(
        self, mock_existence, mock_auth, mock_invoke, mock_slack_post
    ):
        """cleanup_request_files must be called once with correlation_id after processing."""
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])
        mock_invoke.return_value = json.dumps({"status": "success", "response_text": "OK"})
        mock_slack_post.return_value = None

        with patch("pipeline.check_rate_limit") as mock_rate:
            mock_rate.return_value = (True, None)
            with patch("pipeline.cleanup_request_files") as mock_cleanup:
                with patch("pipeline.upload_file_to_s3") as mock_upload:
                    with patch("pipeline.generate_presigned_url"):
                        with patch("pipeline._get_slack_file_bytes") as mock_slack_bytes:
                            mock_slack_bytes.return_value = b"data"
                            mock_upload.return_value = "attachments/cid/F/x"

                            from pipeline import run

                            run({"prompt": json.dumps(_payload(
                                correlation_id="batch-cid",
                                attachments=[
                                    {"id": "F1", "name": "a.pdf", "mimetype": "application/pdf", "size": 1, "url_private_download": "u1"},
                                    {"id": "F2", "name": "b.pdf", "mimetype": "application/pdf", "size": 1, "url_private_download": "u2"},
                                ],
                            ))})

                            mock_cleanup.assert_called_once_with("batch-cid")

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_more_than_five_attachments_only_first_five_enriched(
        self, mock_existence, mock_auth, mock_invoke, mock_slack_post
    ):
        """When more than 5 attachments, only first 5 are uploaded and included (FR-012)."""
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])
        mock_invoke.return_value = json.dumps({"status": "success", "response_text": "OK"})
        mock_slack_post.return_value = None

        with patch("pipeline.check_rate_limit") as mock_rate:
            mock_rate.return_value = (True, None)
            with patch.dict(os.environ, {"FILE_EXCHANGE_BUCKET": "test-bucket"}, clear=False):
                with patch("pipeline.upload_file_to_s3") as mock_upload:
                    with patch("pipeline.generate_presigned_url") as mock_presign:
                        with patch("pipeline.cleanup_request_files"):
                            with patch("pipeline._get_slack_file_bytes") as mock_slack_bytes:
                                mock_slack_bytes.return_value = b"x"
                                mock_upload.return_value = "attachments/corr/F/x"
                                mock_presign.return_value = "https://s3.example.com/k?sig=..."

                                from pipeline import run

                                six_attachments = [
                                    {"id": f"F{i}", "name": f"f{i}.pdf", "mimetype": "application/pdf", "size": 1, "url_private_download": f"u{i}"}
                                    for i in range(1, 7)
                                ]
                                run({"prompt": json.dumps(_payload(attachments=six_attachments))})

                                invoke_payload = mock_invoke.call_args[0][0]
                                assert len(invoke_payload["attachments"]) == 5
                                assert mock_upload.call_count == 5


class TestPipelineLargeFileArtifactS3:
    """Tests for 028: large file artifact (> 200KB) routed via S3."""

    def _make_file_artifact_parts(self, size_bytes: int) -> list:
        """Returns file_artifact parts with contentBase64 of given size."""
        content = b"x" * size_bytes
        b64 = base64.b64encode(content).decode("utf-8")
        return [{"contentBase64": b64, "fileName": "large.pdf", "mimeType": "application/pdf"}]

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_large_file_uses_s3_artifact(
        self, mock_existence, mock_auth, mock_invoke, mock_slack_post
    ):
        """When file_artifact > 200KB, pipeline must use S3-backed delivery (s3PresignedUrl)."""
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])
        large_size = 250 * 1024  # 250 KB
        file_artifact = {"parts": self._make_file_artifact_parts(large_size)}
        mock_invoke.return_value = json.dumps({
            "status": "success",
            "response_text": "Done",
            "file_artifact": file_artifact,
        })
        mock_slack_post.return_value = None

        with patch("pipeline.check_rate_limit") as mock_rate:
            mock_rate.return_value = (True, None)
            with patch.dict(os.environ, {"FILE_EXCHANGE_BUCKET": "test-bucket"}, clear=False):
                with patch("pipeline.upload_generated_file_to_s3") as mock_upload_gen:
                    mock_upload_gen.return_value = "generated_files/corr-1/large.pdf"
                    with patch("pipeline.generate_presigned_url_for_generated_file") as mock_presign:
                        mock_presign.return_value = "https://bucket.s3.amazonaws.com/gen?X-Amz-..."

                        from pipeline import run

                        run({"prompt": json.dumps(_payload())})

                        mock_upload_gen.assert_called_once()
                        call_args = mock_upload_gen.call_args[0]
                        assert call_args[1] == "corr-001"
                        assert call_args[2] == "large.pdf"
                        assert call_args[3] == "application/pdf"
                        assert len(call_args[0]) == large_size

                        mock_presign.assert_called_once_with(
                            "generated_files/corr-1/large.pdf"
                        )

                        mock_slack_post.assert_called_once()
                        slack_call = mock_slack_post.call_args[1]
                        fa = slack_call.get("file_artifact")
                        assert fa is not None
                        assert "s3PresignedUrl" in fa
                        assert fa["s3PresignedUrl"] == "https://bucket.s3.amazonaws.com/gen?X-Amz-..."
                        assert "contentBase64" not in fa
                        assert fa["fileName"] == "large.pdf"
                        assert fa["mimeType"] == "application/pdf"


class TestPipelineSmallFileArtifactInline:
    """Tests for 028: small file artifact (≤ 200KB) uses inline path (contentBase64)."""

    def _make_file_artifact_parts(self, size_bytes: int) -> list:
        """Returns file_artifact parts with contentBase64 of given size."""
        content = b"x" * size_bytes
        b64 = base64.b64encode(content).decode("utf-8")
        return [{"contentBase64": b64, "fileName": "small.pdf", "mimeType": "application/pdf"}]

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_small_file_uses_inline_artifact(
        self, mock_existence, mock_auth, mock_invoke, mock_slack_post
    ):
        """When file_artifact ≤ 200KB, pipeline must use inline delivery (contentBase64)."""
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])
        small_size = 100 * 1024  # 100 KB
        file_artifact = {"parts": self._make_file_artifact_parts(small_size)}
        mock_invoke.return_value = json.dumps({
            "status": "success",
            "response_text": "Done",
            "file_artifact": file_artifact,
        })
        mock_slack_post.return_value = None

        with patch("pipeline.check_rate_limit") as mock_rate:
            mock_rate.return_value = (True, None)
            with patch.dict(os.environ, {"FILE_EXCHANGE_BUCKET": "test-bucket"}, clear=False):
                with patch("pipeline.upload_generated_file_to_s3") as mock_upload_gen:
                    from pipeline import run

                    run({"prompt": json.dumps(_payload())})

                    # upload_generated_file_to_s3 must NOT be called for small files
                    mock_upload_gen.assert_not_called()

                    mock_slack_post.assert_called_once()
                    slack_call = mock_slack_post.call_args[1]
                    fa = slack_call.get("file_artifact")
                    assert fa is not None
                    assert "contentBase64" in fa
                    assert "s3PresignedUrl" not in fa
                    assert fa["fileName"] == "small.pdf"
                    assert fa["mimeType"] == "application/pdf"

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_boundary_200kb_uses_inline(
        self, mock_existence, mock_auth, mock_invoke, mock_slack_post
    ):
        """When file_artifact equals exactly 200KB (≤ threshold), use inline path."""
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])
        boundary_size = 200 * 1024  # Exactly 200 KB
        file_artifact = {"parts": self._make_file_artifact_parts(boundary_size)}
        mock_invoke.return_value = json.dumps({
            "status": "success",
            "response_text": "Done",
            "file_artifact": file_artifact,
        })
        mock_slack_post.return_value = None

        with patch("pipeline.check_rate_limit") as mock_rate:
            mock_rate.return_value = (True, None)
            with patch.dict(os.environ, {"FILE_EXCHANGE_BUCKET": "test-bucket"}, clear=False):
                with patch("pipeline.upload_generated_file_to_s3") as mock_upload_gen:
                    from pipeline import run

                    run({"prompt": json.dumps(_payload())})

                    # At boundary (≤ 200KB), use inline
                    mock_upload_gen.assert_not_called()

                    mock_slack_post.assert_called_once()
                    slack_call = mock_slack_post.call_args[1]
                    fa = slack_call.get("file_artifact")
                    assert fa is not None
                    assert "contentBase64" in fa
                    assert "s3PresignedUrl" not in fa


class Test032E2EFlowUnchanged:
    """032 US3: End-to-end user flow unchanged; no JSON-RPC envelope exposed to Slack."""

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_success_path_passes_response_text_only_no_envelope(
        self, mock_existence, mock_auth, mock_invoke, mock_slack_post
    ):
        """T032: Success path uses only result payload (response_text); no jsonrpc/id sent to Slack."""
        mock_existence.return_value = MagicMock(exists=True)
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])
        mock_invoke.return_value = json.dumps({
            "status": "success",
            "response_text": "AI reply content only",
        })
        mock_slack_post.return_value = None

        with patch("pipeline.check_rate_limit") as mock_rate:
            mock_rate.return_value = (True, None)
            from pipeline import run

            run({"prompt": json.dumps(_payload())})

            mock_slack_post.assert_called_once()
            slack_kw = mock_slack_post.call_args[1]
            assert "AI reply content only" in slack_kw.get("text", "")
            assert "jsonrpc" not in str(slack_kw)
            assert slack_kw.get("file_artifact") is None

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_error_path_passes_user_friendly_message_only_no_raw_envelope(
        self, mock_existence, mock_auth, mock_invoke, mock_slack_post
    ):
        """T032: Error path uses mapped user-facing message only; no raw JSON-RPC error to Slack."""
        mock_existence.return_value = MagicMock(exists=True)
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])
        mock_invoke.return_value = json.dumps({
            "status": "error",
            "error_code": "throttling",
            "error_message": "Rate exceeded",
            "correlation_id": "corr-err",
        })
        mock_slack_post.return_value = None

        with patch("pipeline.check_rate_limit") as mock_rate:
            mock_rate.return_value = (True, None)
            with patch("pipeline.log_execution_agent_error_response"):
                from pipeline import run, ERROR_MESSAGE_MAP

                run({"prompt": json.dumps(_payload())})

                mock_slack_post.assert_called_once()
                slack_kw = mock_slack_post.call_args[1]
                expected_text = ERROR_MESSAGE_MAP.get("throttling")
                assert slack_kw.get("text", "").startswith(expected_text)
                assert "jsonrpc" not in str(slack_kw)
                assert "id" not in expected_text


class Test033RoutingIntegration:
    """Multi-agent routing integration in pipeline."""

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.get_agent_arn", return_value="arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/docs")
    @patch("pipeline.route_request", return_value="docs")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_route_selected_agent_arn_is_passed_to_invoke_execution_agent(
        self,
        mock_existence,
        mock_auth,
        mock_invoke,
        _mock_route_request,
        _mock_get_agent_arn,
        mock_slack_post,
    ):
        """When router selects docs, invoke_execution_agent receives docs runtime ARN."""
        mock_existence.return_value = MagicMock(exists=True)
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])
        mock_invoke.return_value = json.dumps({
            "status": "success",
            "response_text": "docs response",
        })
        mock_slack_post.return_value = None

        with patch("pipeline.check_rate_limit") as mock_rate:
            mock_rate.return_value = (True, None)
            from pipeline import run

            run({"prompt": json.dumps(_payload(text="docs question"))})

            assert mock_invoke.call_count == 1
            kwargs = mock_invoke.call_args[1]
            assert kwargs.get("execution_agent_arn", "").endswith("/docs")


class TestPipelineAgentAttribution:
    """Pipeline must append agent attribution footer to Slack replies from execution agents."""

    def test_build_agent_attribution_with_card_name(self):
        """When agent card has a name, attribution uses it."""
        from pipeline import _build_agent_attribution

        result = _build_agent_attribution(
            "file-creator",
            {"file-creator": {"name": "SlackAI-FileCreatorAgent", "description": "General AI"}},
        )
        assert "SlackAI-FileCreatorAgent" in result

    def test_build_agent_attribution_without_card(self):
        """When no card is available, attribution falls back to agent_id."""
        from pipeline import _build_agent_attribution

        result = _build_agent_attribution("docs", {})
        assert "docs" in result

    def test_build_agent_attribution_with_empty_name(self):
        """When card name is empty, attribution falls back to agent_id."""
        from pipeline import _build_agent_attribution

        result = _build_agent_attribution("time", {"time": {"name": "", "description": ""}})
        assert "time" in result

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_success_response_appended_with_attribution(
        self, mock_existence, mock_auth, mock_invoke, mock_slack_post
    ):
        """On execution success, agent attribution is appended to the Slack message text."""
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])
        mock_invoke.return_value = json.dumps({"status": "success", "response_text": "処理が完了しました。"})
        mock_slack_post.return_value = None

        with patch("pipeline.check_rate_limit") as mock_rate:
            mock_rate.return_value = (True, None)
            with patch("pipeline.get_all_cards", return_value={
                "file-creator": {"name": "SlackAI-FileCreatorAgent", "description": "General AI"},
            }):
                from pipeline import run

                run({"prompt": json.dumps(_payload(text="ファイルを作成して"))})

        posted_text = mock_slack_post.call_args[1].get("text", "")
        assert "処理が完了しました。" in posted_text
        assert "SlackAI-FileCreatorAgent" in posted_text or "file-creator" in posted_text
        # Attribution must come AFTER the response
        main_pos = posted_text.find("処理が完了しました。")
        attr_pos = posted_text.find("file-creator") if "file-creator" in posted_text else posted_text.find("SlackAI-FileCreatorAgent")
        assert main_pos < attr_pos

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_error_response_appended_with_attribution(
        self, mock_existence, mock_auth, mock_invoke, mock_slack_post
    ):
        """On execution error, agent attribution is appended to the error Slack message."""
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])
        mock_invoke.return_value = json.dumps({"status": "error", "error_code": "generic", "error_message": "error"})
        mock_slack_post.return_value = None

        with patch("pipeline.check_rate_limit") as mock_rate:
            mock_rate.return_value = (True, None)
            with patch("pipeline.get_all_cards", return_value={
                "file-creator": {"name": "SlackAI-FileCreatorAgent", "description": "General AI"},
            }):
                from pipeline import run

                run({"prompt": json.dumps(_payload())})

        posted_text = mock_slack_post.call_args[1].get("text", "")
        assert "file-creator" in posted_text or "SlackAI-FileCreatorAgent" in posted_text

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    def test_empty_response_text_attribution_only(
        self, mock_existence, mock_auth, mock_invoke, mock_slack_post
    ):
        """When response_text is empty but file artifact exists, attribution stands alone."""
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])
        mock_invoke.return_value = json.dumps({"status": "success", "response_text": ""})
        mock_slack_post.return_value = None

        with patch("pipeline.check_rate_limit") as mock_rate:
            mock_rate.return_value = (True, None)
            with patch("pipeline.get_all_cards", return_value={"file-creator": None}):
                from pipeline import run

                run({"prompt": json.dumps(_payload())})

        posted_text = mock_slack_post.call_args[1].get("text", "")
        assert "file-creator" in posted_text


class TestPipelineDirectResponse:
    """Pipeline must answer directly when router returns DIRECT_RESPONSE_AGENT_ID."""

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    @patch("pipeline.route_request", return_value="direct")
    @patch("pipeline.get_agent_arn", return_value="")
    @patch("pipeline.get_agent_ids", return_value=["docs", "file-creator"])
    @patch("pipeline.get_all_cards", return_value={
        "docs": {"name": "DocsAgent", "description": "Docs search"},
        "file-creator": {"name": "FileCreatorAgent", "description": "File creation"},
    })
    def test_direct_response_sends_agent_list_to_slack(
        self, _mock_cards, _mock_ids, _mock_arn, _mock_route,
        mock_existence, mock_auth, mock_invoke, mock_slack_post
    ):
        """When routed to 'direct', pipeline posts agent list to Slack without calling execution agent."""
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])

        with patch("pipeline.check_rate_limit") as mock_rate:
            mock_rate.return_value = (True, None)
            from pipeline import run

            result = run({"prompt": json.dumps(_payload(text="接続可能なエージェントの一覧を表示。どのエージェントも呼び出さない。"))})

        # Slack post must be called with an agent list response
        mock_slack_post.assert_called_once()
        posted_text = mock_slack_post.call_args[1].get("text", "")
        assert "docs" in posted_text or "DocsAgent" in posted_text
        assert "file-creator" in posted_text or "FileCreatorAgent" in posted_text

        # Execution agent must NOT be called
        mock_invoke.assert_not_called()

        # Pipeline returns completed status
        result_data = json.loads(result)
        assert result_data["status"] == "completed"

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    @patch("pipeline.route_request", return_value="direct")
    @patch("pipeline.get_agent_arn", return_value="")
    @patch("pipeline.get_agent_ids", return_value=[])
    @patch("pipeline.get_all_cards", return_value={})
    def test_direct_response_with_no_agents_configured(
        self, _mock_cards, _mock_ids, _mock_arn, _mock_route,
        mock_existence, mock_auth, mock_invoke, mock_slack_post
    ):
        """When no agents configured, direct response still posts a message (no error)."""
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])

        with patch("pipeline.check_rate_limit") as mock_rate:
            mock_rate.return_value = (True, None)
            from pipeline import run

            result = run({"prompt": json.dumps(_payload(text="エージェント一覧"))})

        mock_slack_post.assert_called_once()
        mock_invoke.assert_not_called()
        result_data = json.loads(result)
        assert result_data["status"] == "completed"

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    @patch("pipeline.route_request", return_value="unrouted")
    @patch("pipeline.get_agent_arn", return_value="")
    @patch("pipeline._generate_unrouted_fallback_response", return_value="Verification agent fallback reply")
    def test_unrouted_request_returns_verification_llm_reply_without_execution_agent(
        self, _mock_fallback, _mock_arn, _mock_route,
        mock_existence, mock_auth, mock_invoke, mock_slack_post
    ):
        """When no suitable agent is routed, verification LLM response is sent and pipeline completes."""
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])

        with patch("pipeline.check_rate_limit") as mock_rate:
            mock_rate.return_value = (True, None)
            from pipeline import run

            result = run({"prompt": json.dumps(_payload(text="特殊な依頼"))})

        mock_invoke.assert_not_called()
        mock_slack_post.assert_called_once()
        assert mock_slack_post.call_args[1].get("text") == "Verification agent fallback reply"
        result_data = json.loads(result)
        assert result_data["status"] == "completed"

    @patch("pipeline.send_slack_post_request")
    @patch("pipeline.invoke_execution_agent")
    @patch("pipeline.authorize_request")
    @patch("pipeline.check_entity_existence")
    @patch("pipeline.route_request", return_value="unrouted")
    @patch("pipeline.get_agent_arn", return_value="")
    @patch("pipeline._generate_unrouted_fallback_response", return_value="")
    def test_unrouted_request_uses_static_warning_when_llm_fallback_empty(
        self, _mock_fallback, _mock_arn, _mock_route,
        mock_existence, mock_auth, mock_invoke, mock_slack_post
    ):
        """If fallback LLM returns empty text, static guidance is used and pipeline still completes."""
        mock_auth.return_value = MagicMock(authorized=True, unauthorized_entities=[])

        with patch("pipeline.check_rate_limit") as mock_rate:
            mock_rate.return_value = (True, None)
            from pipeline import run

            result = run({"prompt": json.dumps(_payload(text="特殊な依頼"))})

        mock_invoke.assert_not_called()
        mock_slack_post.assert_called_once()
        posted_text = mock_slack_post.call_args[1].get("text", "")
        assert "適したエージェントを選択できませんでした" in posted_text
        result_data = json.loads(result)
        assert result_data["status"] == "completed"


@pytest.mark.skip(reason="要検証: E2E. Slack → Verification → Execution (JSON-RPC) → Verification → Slack. Run manually or in integration env.")
def test_e2e_slack_verification_execution_slack_unchanged():
    """T031/T033: E2E flow unchanged. Reply content and error messages equivalent to pre-JSON-RPC baseline."""
    pass
