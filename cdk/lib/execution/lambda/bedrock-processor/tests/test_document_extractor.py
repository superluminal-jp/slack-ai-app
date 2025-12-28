"""
Unit tests for document extractor module.

Tests text extraction from various document formats.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import tempfile
import os

# Import module to test
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from document_extractor import (
    extract_text_from_pdf,
    extract_text_from_docx,
    extract_text_from_csv,
    extract_text_from_xlsx,
    extract_text_from_pptx,
    extract_text_from_txt,
    convert_pptx_slides_to_images,
)


class TestPDFExtraction:
    """Test PDF text extraction."""
    
    @patch('document_extractor.PyPDF2')
    def test_extract_text_from_pdf_success(self, mock_pypdf2):
        """Test successful PDF text extraction."""
        # Mock PyPDF2
        mock_page1 = Mock()
        mock_page1.extract_text.return_value = "Page 1 text"
        mock_page2 = Mock()
        mock_page2.extract_text.return_value = "Page 2 text"
        
        mock_reader = Mock()
        mock_reader.pages = [mock_page1, mock_page2]
        
        mock_pypdf2.PdfReader.return_value = mock_reader
        
        pdf_bytes = b'fake pdf content'
        result = extract_text_from_pdf(pdf_bytes)
        
        assert result == "Page 1 text\n\nPage 2 text"
        mock_pypdf2.PdfReader.assert_called_once()
    
    @patch('document_extractor.PyPDF2', None)
    def test_extract_text_from_pdf_no_library(self):
        """Test PDF extraction when PyPDF2 is not available."""
        pdf_bytes = b'fake pdf content'
        result = extract_text_from_pdf(pdf_bytes)
        assert result is None
    
    @patch('document_extractor.PyPDF2')
    def test_extract_text_from_pdf_error(self, mock_pypdf2):
        """Test PDF extraction error handling."""
        mock_pypdf2.PdfReader.side_effect = Exception("PDF parsing error")
        
        pdf_bytes = b'fake pdf content'
        result = extract_text_from_pdf(pdf_bytes)
        
        assert result is None


class TestDOCXExtraction:
    """Test DOCX text extraction."""
    
    @patch('document_extractor.docx')
    def test_extract_text_from_docx_success(self, mock_docx):
        """Test successful DOCX text extraction."""
        # Mock python-docx
        mock_para1 = Mock()
        mock_para1.text = "Paragraph 1"
        mock_para2 = Mock()
        mock_para2.text = "Paragraph 2"
        
        mock_doc = Mock()
        mock_doc.paragraphs = [mock_para1, mock_para2]
        
        mock_docx.Document.return_value = mock_doc
        
        docx_bytes = b'fake docx content'
        result = extract_text_from_docx(docx_bytes)
        
        assert result == "Paragraph 1\nParagraph 2"
        mock_docx.Document.assert_called_once()
    
    @patch('document_extractor.docx', None)
    def test_extract_text_from_docx_no_library(self):
        """Test DOCX extraction when python-docx is not available."""
        docx_bytes = b'fake docx content'
        result = extract_text_from_docx(docx_bytes)
        assert result is None
    
    @patch('document_extractor.docx')
    def test_extract_text_from_docx_error(self, mock_docx):
        """Test DOCX extraction error handling."""
        mock_docx.Document.side_effect = Exception("DOCX parsing error")
        
        docx_bytes = b'fake docx content'
        result = extract_text_from_docx(docx_bytes)
        
        assert result is None


class TestCSVExtraction:
    """Test CSV text extraction."""
    
    def test_extract_text_from_csv_success(self):
        """Test successful CSV text extraction."""
        csv_bytes = b'Name,Age,City\nJohn,30,Tokyo\nJane,25,Osaka'
        result = extract_text_from_csv(csv_bytes)
        
        assert result is not None
        assert "Name,Age,City" in result
        assert "John,30,Tokyo" in result
        assert "Jane,25,Osaka" in result
    
    def test_extract_text_from_csv_empty(self):
        """Test CSV extraction with empty file."""
        csv_bytes = b''
        result = extract_text_from_csv(csv_bytes)
        assert result is None
    
    def test_extract_text_from_csv_encoding_error(self):
        """Test CSV extraction with encoding issues."""
        # Invalid UTF-8 bytes
        csv_bytes = b'\xff\xfe\x00\x00'
        result = extract_text_from_csv(csv_bytes)
        # Should handle with errors='replace'
        assert result is not None


class TestXLSXExtraction:
    """Test XLSX text extraction."""
    
    @patch('document_extractor.openpyxl')
    def test_extract_text_from_xlsx_success(self, mock_openpyxl):
        """Test successful XLSX text extraction."""
        # Mock openpyxl
        mock_cell1 = Mock()
        mock_cell1.value = "Value1"
        mock_cell2 = Mock()
        mock_cell2.value = "Value2"
        
        mock_row1 = Mock()
        mock_row1.__iter__ = Mock(return_value=iter([mock_cell1, mock_cell2]))
        
        mock_sheet = Mock()
        mock_sheet.iter_rows.return_value = [mock_row1]
        
        mock_workbook = Mock()
        mock_workbook.sheetnames = ["Sheet1"]
        mock_workbook.__getitem__.return_value = mock_sheet
        
        mock_openpyxl.load_workbook.return_value = mock_workbook
        
        xlsx_bytes = b'fake xlsx content'
        result = extract_text_from_xlsx(xlsx_bytes)
        
        assert result is not None
        assert "Sheet: Sheet1" in result
        mock_openpyxl.load_workbook.assert_called_once()
    
    @patch('document_extractor.openpyxl', None)
    def test_extract_text_from_xlsx_no_library(self):
        """Test XLSX extraction when openpyxl is not available."""
        xlsx_bytes = b'fake xlsx content'
        result = extract_text_from_xlsx(xlsx_bytes)
        assert result is None
    
    @patch('document_extractor.openpyxl')
    def test_extract_text_from_xlsx_error(self, mock_openpyxl):
        """Test XLSX extraction error handling."""
        mock_openpyxl.load_workbook.side_effect = Exception("XLSX parsing error")
        
        xlsx_bytes = b'fake xlsx content'
        result = extract_text_from_xlsx(xlsx_bytes)
        
        assert result is None


class TestPPTXExtraction:
    """Test PPTX text extraction."""
    
    @patch('document_extractor.Presentation')
    def test_extract_text_from_pptx_success(self, mock_presentation):
        """Test successful PPTX text extraction."""
        # Mock python-pptx
        mock_shape1 = Mock()
        mock_shape1.text = "Slide 1 text"
        hasattr(mock_shape1, 'text')
        
        mock_slide1 = Mock()
        mock_slide1.shapes = [mock_shape1]
        
        mock_prs = Mock()
        mock_prs.slides = [mock_slide1]
        
        mock_presentation.return_value = mock_prs
        
        pptx_bytes = b'fake pptx content'
        result = extract_text_from_pptx(pptx_bytes)
        
        assert result is not None
        assert "Slide 1:" in result
        assert "Slide 1 text" in result
    
    @patch('document_extractor.Presentation', None)
    def test_extract_text_from_pptx_no_library(self):
        """Test PPTX extraction when python-pptx is not available."""
        pptx_bytes = b'fake pptx content'
        result = extract_text_from_pptx(pptx_bytes)
        assert result is None
    
    @patch('document_extractor.Presentation')
    def test_extract_text_from_pptx_error(self, mock_presentation):
        """Test PPTX extraction error handling."""
        mock_presentation.side_effect = Exception("PPTX parsing error")
        
        pptx_bytes = b'fake pptx content'
        result = extract_text_from_pptx(pptx_bytes)
        
        assert result is None


class TestPPTXImageConversion:
    """Test PPTX slide-to-image conversion (disabled)."""
    
    def test_convert_pptx_slides_to_images_disabled(self):
        """Test that PPTX slide-to-image conversion is disabled (returns None)."""
        pptx_bytes = b'fake pptx content'
        result = convert_pptx_slides_to_images(pptx_bytes)
        
        # Function is disabled and always returns None
        assert result is None


class TestTXTExtraction:
    """Test TXT text extraction."""
    
    def test_extract_text_from_txt_success(self):
        """Test successful TXT text extraction."""
        txt_bytes = b'This is plain text content.'
        result = extract_text_from_txt(txt_bytes)
        
        assert result == "This is plain text content."
    
    def test_extract_text_from_txt_utf8(self):
        """Test TXT extraction with UTF-8 content."""
        txt_bytes = 'こんにちは'.encode('utf-8')
        result = extract_text_from_txt(txt_bytes)
        
        assert result == "こんにちは"
    
    def test_extract_text_from_txt_encoding_error(self):
        """Test TXT extraction with encoding issues."""
        # Invalid UTF-8 bytes
        txt_bytes = b'\xff\xfe\x00\x00'
        result = extract_text_from_txt(txt_bytes)
        # Should handle with errors='replace'
        assert result is not None

