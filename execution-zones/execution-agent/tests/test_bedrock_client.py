"""
Unit tests for bedrock_client_converse (US1 native document blocks).

Tests:
- prepare_document_content_converse: block format, name sanitization, format mapping, PPTX returns None
- invoke_bedrock with documents parameter: content block order (text, documents, images)
"""

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestPrepareDocumentContentConverse:
    """Tests for prepare_document_content_converse (native document block)."""

    def test_returns_correct_document_block_format(self):
        """Block must have document.name, document.format, document.source.bytes."""
        from bedrock_client_converse import prepare_document_content_converse

        raw = b"%PDF-1.4 fake pdf content"
        block = prepare_document_content_converse(raw, "application/pdf", "report.pdf")

        assert block is not None
        assert "document" in block
        doc = block["document"]
        assert "name" in doc
        assert "format" in doc
        assert doc["format"] == "pdf"
        assert "source" in doc
        assert "bytes" in doc["source"]
        assert doc["source"]["bytes"] == raw

    def test_filename_sanitization_alphanumeric_hyphens_spaces(self):
        """Name must be sanitized: alphanumeric, hyphens, spaces only (prevent prompt injection)."""
        from bedrock_client_converse import prepare_document_content_converse

        block = prepare_document_content_converse(
            b"content", "text/plain", "my file 2024 (draft).txt"
        )
        assert block is not None
        name = block["document"]["name"]
        # Should not contain dots, special chars that could inject
        for c in name:
            assert c.isalnum() or c in " -()[]", f"Invalid char in name: {repr(c)}"

    def test_name_truncated_to_100_chars(self):
        """Name must be truncated to 100 chars."""
        from bedrock_client_converse import prepare_document_content_converse

        long_name = "a" * 150 + ".pdf"
        block = prepare_document_content_converse(
            b"x", "application/pdf", long_name
        )
        assert block is not None
        assert len(block["document"]["name"]) <= 100

    def test_format_mapping_pdf_docx_xlsx_csv_txt(self):
        """MIME to Bedrock format: pdf, docx, xlsx, csv, txt."""
        from bedrock_client_converse import prepare_document_content_converse

        cases = [
            ("application/pdf", "pdf"),
            ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"),
            ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
            ("text/csv", "csv"),
            ("text/plain", "txt"),
        ]
        for mimetype, expected_format in cases:
            block = prepare_document_content_converse(b"x", mimetype, "f.x")
            assert block is not None, mimetype
            assert block["document"]["format"] == expected_format, mimetype

    def test_pptx_returns_none_fallback_to_text_extraction(self):
        """PPTX is not native; must return None to trigger text extraction fallback."""
        from bedrock_client_converse import prepare_document_content_converse

        block = prepare_document_content_converse(
            b"pk", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "slide.pptx"
        )
        assert block is None

    def test_text_block_required_alongside_document(self):
        """invoke_bedrock must build content with text first when documents present."""
        # This is tested via invoke_bedrock: at least one text block when documents are passed
        from bedrock_client_converse import invoke_bedrock

        with patch("bedrock_client_converse.boto3") as mock_boto3:
            mock_runtime = MagicMock()
            mock_runtime.converse.return_value = {
                "output": {"message": {"content": [{"text": "Summary of the document."}]}},
                "stopReason": "end_turn",
                "usage": {},
            }
            mock_boto3.client.return_value = mock_runtime

            invoke_bedrock(
                prompt="Summarize the document.",
                documents=[{"bytes": b"pdf content", "format": "pdf", "name": "doc1"}],
            )

            call_kw = mock_runtime.converse.call_args[1]
            messages = call_kw["messages"]
            content = messages[-1]["content"]
            # First block must be text (required alongside documents)
            assert content[0].get("text") is not None
            # Document block(s) follow
            document_blocks = [p for p in content if "document" in p]
            assert len(document_blocks) == 1
            assert document_blocks[0]["document"]["format"] == "pdf"


class TestInvokeBedrockWithDocuments:
    """Tests for invoke_bedrock documents parameter."""

    @patch("bedrock_client_converse.boto3")
    def test_invoke_bedrock_accepts_documents_parameter(self, mock_boto3):
        """invoke_bedrock must accept documents and include document content blocks."""
        mock_runtime = MagicMock()
        mock_runtime.converse.return_value = {
            "output": {"message": {"content": [{"text": "Done."}]}},
            "stopReason": "end_turn",
            "usage": {},
        }
        mock_boto3.client.return_value = mock_runtime

        from bedrock_client_converse import invoke_bedrock

        result = invoke_bedrock(
            prompt="What is in the document?",
            documents=[
                {"bytes": b"raw bytes", "format": "pdf", "name": "report"},
            ],
        )

        assert result == "Done."
        call_kw = mock_runtime.converse.call_args[1]
        content = call_kw["messages"][-1]["content"]
        text_parts = [p for p in content if "text" in p]
        doc_parts = [p for p in content if "document" in p]
        assert len(text_parts) >= 1
        assert len(doc_parts) == 1
        assert doc_parts[0]["document"]["source"]["bytes"] == b"raw bytes"


class TestInvokeBedrockMultipleFilesUs3:
    """Tests for combined prompt construction (US3): multiple docs + images, limits."""

    @patch("bedrock_client_converse.boto3")
    def test_multiple_documents_and_images_in_single_call(self, mock_boto3):
        """invoke_bedrock must accept multiple documents and images in one call."""
        mock_runtime = MagicMock()
        mock_runtime.converse.return_value = {
            "output": {"message": {"content": [{"text": "Analyzed."}]}},
            "stopReason": "end_turn",
            "usage": {},
        }
        mock_boto3.client.return_value = mock_runtime

        from bedrock_client_converse import invoke_bedrock

        invoke_bedrock(
            prompt="Compare these.",
            documents=[
                {"bytes": b"pdf1", "format": "pdf", "name": "d1"},
                {"bytes": b"pdf2", "format": "pdf", "name": "d2"},
            ],
            images=[b"\x89PNG\r\n\x1a\n" + b"\x00" * 50, b"\xff\xd8\xff" + b"\x00" * 50],
            image_formats=["png", "jpeg"],
        )

        content = mock_runtime.converse.call_args[1]["messages"][-1]["content"]
        doc_blocks = [p for p in content if "document" in p]
        image_blocks = [p for p in content if "image" in p]
        assert len(doc_blocks) == 2
        assert len(image_blocks) == 2

    @patch("bedrock_client_converse.boto3")
    def test_max_five_documents_in_request(self, mock_boto3):
        """Up to 5 document blocks per Bedrock request (FR-012)."""
        mock_runtime = MagicMock()
        mock_runtime.converse.return_value = {
            "output": {"message": {"content": [{"text": "Done."}]}},
            "stopReason": "end_turn",
            "usage": {},
        }
        mock_boto3.client.return_value = mock_runtime

        from bedrock_client_converse import invoke_bedrock

        five_docs = [
            {"bytes": b"c" + str(i).encode(), "format": "pdf", "name": f"doc{i}"}
            for i in range(5)
        ]
        invoke_bedrock(prompt="Summarize.", documents=five_docs)

        content = mock_runtime.converse.call_args[1]["messages"][-1]["content"]
        doc_blocks = [p for p in content if "document" in p]
        assert len(doc_blocks) == 5

    @patch("bedrock_client_converse.boto3")
    def test_mixed_document_types_pdf_csv(self, mock_boto3):
        """Mixed document types (PDF + CSV) in single request."""
        mock_runtime = MagicMock()
        mock_runtime.converse.return_value = {
            "output": {"message": {"content": [{"text": "Done."}]}},
            "stopReason": "end_turn",
            "usage": {},
        }
        mock_boto3.client.return_value = mock_runtime

        from bedrock_client_converse import invoke_bedrock

        invoke_bedrock(
            prompt="Compare.",
            documents=[
                {"bytes": b"%PDF-1", "format": "pdf", "name": "r.pdf"},
                {"bytes": b"a,b\n1,2", "format": "csv", "name": "d.csv"},
            ],
        )

        content = mock_runtime.converse.call_args[1]["messages"][-1]["content"]
        doc_blocks = [p for p in content if "document" in p]
        assert len(doc_blocks) == 2
        formats = [d["document"]["format"] for d in doc_blocks]
        assert "pdf" in formats and "csv" in formats

    @patch("bedrock_client_converse.boto3")
    def test_combined_document_and_image_blocks(self, mock_boto3):
        """Content order: text, then document blocks, then image blocks."""
        mock_runtime = MagicMock()
        mock_runtime.converse.return_value = {
            "output": {"message": {"content": [{"text": "Done."}]}},
            "stopReason": "end_turn",
            "usage": {},
        }
        mock_boto3.client.return_value = mock_runtime

        from bedrock_client_converse import invoke_bedrock

        invoke_bedrock(
            prompt="Describe.",
            documents=[{"bytes": b"pdf", "format": "pdf", "name": "x.pdf"}],
            images=[b"\x89PNG\r\n\x1a\n" + b"\x00" * 20],
            image_formats=["png"],
        )

        content = mock_runtime.converse.call_args[1]["messages"][-1]["content"]
        types = []
        for p in content:
            if "text" in p:
                types.append("text")
            elif "document" in p:
                types.append("document")
            elif "image" in p:
                types.append("image")
        assert types == ["text", "document", "image"]

    @patch("bedrock_client_converse.boto3")
    def test_documents_exceeding_five_truncated_to_five(self, mock_boto3):
        """When more than 5 documents passed, only first 5 are sent (partial processing)."""
        mock_runtime = MagicMock()
        mock_runtime.converse.return_value = {
            "output": {"message": {"content": [{"text": "Done."}]}},
            "stopReason": "end_turn",
            "usage": {},
        }
        mock_boto3.client.return_value = mock_runtime

        from bedrock_client_converse import invoke_bedrock

        six_docs = [
            {"bytes": b"c", "format": "pdf", "name": f"d{i}"}
            for i in range(6)
        ]
        invoke_bedrock(prompt="Summarize.", documents=six_docs)

        content = mock_runtime.converse.call_args[1]["messages"][-1]["content"]
        doc_blocks = [p for p in content if "document" in p]
        assert len(doc_blocks) == 5
