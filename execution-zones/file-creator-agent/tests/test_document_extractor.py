"""Tests for document_extractor module — PDF extraction via pypdf."""

import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import document_extractor


class TestExtractTextFromPdf:
    """PDF text extraction using pypdf."""

    def test_returns_extracted_text(self):
        """extract_text_from_pdf returns concatenated page text."""
        mock_page1 = MagicMock()
        mock_page1.extract_text.return_value = "Hello from page 1"
        mock_page2 = MagicMock()
        mock_page2.extract_text.return_value = "Hello from page 2"

        mock_reader = MagicMock()
        mock_reader.pages = [mock_page1, mock_page2]

        mock_pypdf = MagicMock()
        mock_pypdf.PdfReader.return_value = mock_reader

        with patch.object(document_extractor, "pypdf", mock_pypdf):
            result = document_extractor.extract_text_from_pdf(b"%PDF fake bytes")

        assert result == "Hello from page 1\n\nHello from page 2"

    def test_returns_none_when_all_pages_empty(self):
        """extract_text_from_pdf returns None when no page yields text."""
        mock_page = MagicMock()
        mock_page.extract_text.return_value = ""

        mock_reader = MagicMock()
        mock_reader.pages = [mock_page]

        mock_pypdf = MagicMock()
        mock_pypdf.PdfReader.return_value = mock_reader

        with patch.object(document_extractor, "pypdf", mock_pypdf):
            result = document_extractor.extract_text_from_pdf(b"%PDF fake bytes")

        assert result is None

    def test_returns_none_on_exception(self):
        """extract_text_from_pdf returns None when pypdf raises an error."""
        mock_pypdf = MagicMock()
        mock_pypdf.PdfReader.side_effect = Exception("corrupt pdf")

        with patch.object(document_extractor, "pypdf", mock_pypdf):
            result = document_extractor.extract_text_from_pdf(b"not a pdf")

        assert result is None

    def test_skips_pages_with_none_text(self):
        """extract_text_from_pdf skips pages where extract_text returns None."""
        mock_page1 = MagicMock()
        mock_page1.extract_text.return_value = None
        mock_page2 = MagicMock()
        mock_page2.extract_text.return_value = "Only page"

        mock_reader = MagicMock()
        mock_reader.pages = [mock_page1, mock_page2]

        mock_pypdf = MagicMock()
        mock_pypdf.PdfReader.return_value = mock_reader

        with patch.object(document_extractor, "pypdf", mock_pypdf):
            result = document_extractor.extract_text_from_pdf(b"%PDF fake bytes")

        assert result == "Only page"

    def test_returns_none_when_pypdf_unavailable(self):
        """extract_text_from_pdf returns None gracefully when pypdf is missing."""
        with patch.object(document_extractor, "pypdf", None):
            result = document_extractor.extract_text_from_pdf(b"%PDF fake bytes")

        assert result is None
