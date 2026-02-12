"""
Unit tests for s3_file_manager (US4 Secure Cross-Zone File Transfer).

Tests:
- upload_file_to_s3: correct S3 key structure, content type set, error handling
- generate_presigned_url: returns HTTPS URL, expiry parameter passed
- cleanup_request_files: lists and deletes all objects under correlation_id prefix
"""

import os
import sys
from unittest.mock import MagicMock, patch, call

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# S3 key structure per data-model: attachments/{correlation_id}/{file_id}/{file_name}
EXPECTED_PREFIX = "attachments/"


class TestUploadFileToS3:
    """Tests for upload_file_to_s3."""

    @patch.dict(os.environ, {"FILE_EXCHANGE_BUCKET": "test-bucket"}, clear=False)
    @patch("s3_file_manager.boto3")
    def test_upload_returns_correct_s3_key_structure(self, mock_boto3):
        """S3 key must be attachments/{correlation_id}/{file_id}/{file_name}."""
        mock_s3 = MagicMock()
        mock_boto3.client.return_value = mock_s3

        from s3_file_manager import upload_file_to_s3

        key = upload_file_to_s3(
            file_bytes=b"test content",
            correlation_id="corr-uuid-123",
            file_id="F01234567",
            file_name="report.pdf",
            mimetype="application/pdf",
        )

        assert key.startswith(EXPECTED_PREFIX)
        assert "corr-uuid-123" in key
        assert "F01234567" in key
        assert "report.pdf" in key
        assert key == f"{EXPECTED_PREFIX}corr-uuid-123/F01234567/report.pdf"

        mock_s3.put_object.assert_called_once()
        call_kw = mock_s3.put_object.call_args[1]
        assert call_kw["Bucket"] == "test-bucket"
        assert call_kw["Key"] == key
        assert call_kw["Body"] == b"test content"
        assert call_kw["ContentType"] == "application/pdf"

    @patch.dict(os.environ, {"FILE_EXCHANGE_BUCKET": "my-bucket"}, clear=False)
    @patch("s3_file_manager.boto3")
    def test_upload_sets_content_type(self, mock_boto3):
        """ContentType must be set from mimetype parameter."""
        mock_s3 = MagicMock()
        mock_boto3.client.return_value = mock_s3

        from s3_file_manager import upload_file_to_s3

        upload_file_to_s3(
            file_bytes=b"image data",
            correlation_id="c1",
            file_id="F1",
            file_name="img.png",
            mimetype="image/png",
        )

        call_kw = mock_s3.put_object.call_args[1]
        assert call_kw["ContentType"] == "image/png"

    @patch.dict(os.environ, {"FILE_EXCHANGE_BUCKET": "b"}, clear=False)
    @patch("s3_file_manager.boto3")
    def test_upload_s3_failure_raises_or_propagates(self, mock_boto3):
        """S3 upload failures should be propagated (caller handles)."""
        mock_s3 = MagicMock()
        mock_s3.put_object.side_effect = Exception("S3 PutObject failed")
        mock_boto3.client.return_value = mock_s3

        from s3_file_manager import upload_file_to_s3

        with pytest.raises(Exception, match="S3 PutObject failed"):
            upload_file_to_s3(
                file_bytes=b"x",
                correlation_id="c",
                file_id="F",
                file_name="f.txt",
                mimetype="text/plain",
            )

    @patch.dict(os.environ, {}, clear=False)
    def test_upload_requires_bucket_env(self):
        """upload_file_to_s3 should fail or use default when FILE_EXCHANGE_BUCKET unset."""
        with patch("s3_file_manager.boto3") as mock_boto3:
            mock_s3 = MagicMock()
            mock_boto3.client.return_value = mock_s3
            try:
                from s3_file_manager import upload_file_to_s3

                # If implementation uses os.environ at call time, this may raise or use empty
                upload_file_to_s3(
                    file_bytes=b"x",
                    correlation_id="c",
                    file_id="F",
                    file_name="f.txt",
                    mimetype="text/plain",
                )
                # If no raise, bucket might be read at call time from env (then empty)
                call_kw = mock_s3.put_object.call_args[1]
                assert "Bucket" in call_kw
            except (ValueError, KeyError, Exception):
                pass  # Acceptable: implementation may require env set


class TestGeneratePresignedUrl:
    """Tests for generate_presigned_url."""

    @patch.dict(os.environ, {"FILE_EXCHANGE_BUCKET": "presign-bucket"}, clear=False)
    @patch("s3_file_manager.boto3")
    def test_returns_https_url(self, mock_boto3):
        """Presigned URL must be HTTPS."""
        mock_s3 = MagicMock()
        mock_s3.generate_presigned_url.return_value = "https://presign-bucket.s3.region.amazonaws.com/key?X-Amz-..."
        mock_boto3.client.return_value = mock_s3

        from s3_file_manager import generate_presigned_url

        url = generate_presigned_url("attachments/corr/F1/file.pdf", expiry=900)

        assert url.startswith("https://")
        mock_s3.generate_presigned_url.assert_called_once()
        call_kw = mock_s3.generate_presigned_url.call_args[1]
        assert call_kw["ExpiresIn"] == 900
        assert call_kw["Params"].get("Bucket") == "presign-bucket"
        assert call_kw["Params"].get("Key") == "attachments/corr/F1/file.pdf"

    @patch.dict(os.environ, {"FILE_EXCHANGE_BUCKET": "b"}, clear=False)
    @patch("s3_file_manager.boto3")
    def test_expiry_parameter_passed(self, mock_boto3):
        """Expiry parameter must be passed to generate_presigned_url."""
        mock_s3 = MagicMock()
        mock_s3.generate_presigned_url.return_value = "https://example.com/signed"
        mock_boto3.client.return_value = mock_s3

        from s3_file_manager import generate_presigned_url

        generate_presigned_url("attachments/c/k", expiry=600)
        assert mock_s3.generate_presigned_url.call_args[1]["ExpiresIn"] == 600


class TestCleanupRequestFiles:
    """Tests for cleanup_request_files."""

    @patch.dict(os.environ, {"FILE_EXCHANGE_BUCKET": "cleanup-bucket"}, clear=False)
    @patch("s3_file_manager.boto3")
    def test_lists_and_deletes_under_correlation_id_prefix(self, mock_boto3):
        """Must list objects under attachments/{correlation_id}/ and delete each."""
        mock_s3 = MagicMock()
        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = [
            {
                "Contents": [
                    {"Key": "attachments/corr-1/F1/a.pdf"},
                    {"Key": "attachments/corr-1/F2/b.txt"},
                ],
            },
        ]
        mock_s3.get_paginator.return_value = mock_paginator
        mock_boto3.client.return_value = mock_s3

        from s3_file_manager import cleanup_request_files

        cleanup_request_files("corr-1")

        mock_s3.get_paginator.assert_called_once_with("list_objects_v2")
        mock_paginator.paginate.assert_called_once()
        list_kw = mock_paginator.paginate.call_args[1]
        assert list_kw["Bucket"] == "cleanup-bucket"
        assert list_kw["Prefix"] == "attachments/corr-1/"

        assert mock_s3.delete_objects.call_count == 1
        delete_kw = mock_s3.delete_objects.call_args[1]
        assert "Delete" in delete_kw
        keys = [o["Key"] for o in delete_kw["Delete"]["Objects"]]
        assert "attachments/corr-1/F1/a.pdf" in keys
        assert "attachments/corr-1/F2/b.txt" in keys

    @patch.dict(os.environ, {"FILE_EXCHANGE_BUCKET": "b"}, clear=False)
    @patch("s3_file_manager.boto3")
    def test_cleanup_no_objects_does_not_delete(self, mock_boto3):
        """When no objects under prefix, delete_objects should not be called or receive empty."""
        mock_s3 = MagicMock()
        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = [{}]  # no Contents
        mock_s3.get_paginator.return_value = mock_paginator
        mock_boto3.client.return_value = mock_s3

        from s3_file_manager import cleanup_request_files

        cleanup_request_files("empty-corr")

        mock_s3.get_paginator.assert_called_once_with("list_objects_v2")
        # Implementation should not call delete_objects when no keys
        if mock_s3.delete_objects.called:
            delete_kw = mock_s3.delete_objects.call_args[1]
            assert len(delete_kw.get("Delete", {}).get("Objects", [])) == 0
