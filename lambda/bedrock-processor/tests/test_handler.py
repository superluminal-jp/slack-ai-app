"""
Unit tests for bedrock-processor Lambda handler.

Tests attachment processing integration and Bedrock API invocation.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import json
import os

# Import handler module to test
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from handler import lambda_handler


class TestAttachmentProcessing:
    """Test attachment processing in handler."""
    
    @patch('handler.post_to_slack')
    @patch('handler.invoke_bedrock')
    @patch('handler.process_attachments')
    @patch('handler.get_thread_history')
    def test_process_message_with_image_attachment(self, mock_thread_history, mock_process, mock_bedrock, mock_post):
        """Test processing message with image attachment."""
        # Mock thread history (no history)
        mock_thread_history.return_value = []
        
        # Mock attachment processing
        mock_process.return_value = [
            {
                "file_id": "F01234567",
                "file_name": "test.png",
                "mimetype": "image/png",
                "content_type": "image",
                "processing_status": "success",
                "content": b'PNG image data',
            }
        ]
        
        # Mock Bedrock response
        mock_bedrock.return_value = "This is a test image showing..."
        
        event = {
            "channel": "C01234567",
            "text": "What's in this image?",
            "bot_token": "xoxb-token",
            "attachments": [
                {
                    "id": "F01234567",
                    "name": "test.png",
                    "mimetype": "image/png",
                    "size": 1024,
                }
            ]
        }
        
        context = Mock()
        context.request_id = "test-request-id"
        
        result = lambda_handler(event, context)
        
        # Verify attachment processing was called
        mock_process.assert_called_once()
        
        # Verify Bedrock was called with images
        mock_bedrock.assert_called_once()
        call_args = mock_bedrock.call_args
        assert call_args[1]['images'] is not None
        assert len(call_args[1]['images']) == 1
        
        # Verify response was posted
        mock_post.assert_called_once()
    
    @patch('handler.post_to_slack')
    @patch('handler.invoke_bedrock')
    @patch('handler.process_attachments')
    @patch('handler.get_thread_history')
    def test_process_message_with_document_attachment(self, mock_thread_history, mock_process, mock_bedrock, mock_post):
        """Test processing message with document attachment."""
        # Mock thread history (no history)
        mock_thread_history.return_value = []
        
        # Mock attachment processing
        mock_process.return_value = [
            {
                "file_id": "F01234567",
                "file_name": "document.pdf",
                "mimetype": "application/pdf",
                "content_type": "document",
                "processing_status": "success",
                "content": "Extracted PDF text content",
            }
        ]
        
        # Mock Bedrock response
        mock_bedrock.return_value = "Based on the document..."
        
        event = {
            "channel": "C01234567",
            "text": "Summarize this document",
            "bot_token": "xoxb-token",
            "attachments": [
                {
                    "id": "F01234567",
                    "name": "document.pdf",
                    "mimetype": "application/pdf",
                    "size": 2048,
                }
            ]
        }
        
        context = Mock()
        context.request_id = "test-request-id"
        
        result = lambda_handler(event, context)
        
        # Verify attachment processing was called
        mock_process.assert_called_once()
        
        # Verify Bedrock was called with document texts
        mock_bedrock.assert_called_once()
        call_args = mock_bedrock.call_args
        assert call_args[1]['document_texts'] is not None
        assert len(call_args[1]['document_texts']) == 1
        
        # Verify response was posted
        mock_post.assert_called_once()
    
    @patch('handler.post_to_slack')
    @patch('handler.invoke_bedrock')
    @patch('handler.process_attachments')
    @patch('handler.get_thread_history')
    def test_process_message_with_multiple_attachments(self, mock_thread_history, mock_process, mock_bedrock, mock_post):
        """Test processing message with multiple attachments."""
        # Mock thread history (no history)
        mock_thread_history.return_value = []
        
        # Mock attachment processing (image + document)
        mock_process.return_value = [
            {
                "file_id": "F01234567",
                "file_name": "image.png",
                "mimetype": "image/png",
                "content_type": "image",
                "processing_status": "success",
                "content": b'PNG image data',
            },
            {
                "file_id": "F01234568",
                "file_name": "document.pdf",
                "mimetype": "application/pdf",
                "content_type": "document",
                "processing_status": "success",
                "content": "Extracted PDF text",
            }
        ]
        
        # Mock Bedrock response
        mock_bedrock.return_value = "Based on the image and document..."
        
        event = {
            "channel": "C01234567",
            "text": "Analyze these",
            "bot_token": "xoxb-token",
            "attachments": [
                {
                    "id": "F01234567",
                    "name": "image.png",
                    "mimetype": "image/png",
                    "size": 1024,
                },
                {
                    "id": "F01234568",
                    "name": "document.pdf",
                    "mimetype": "application/pdf",
                    "size": 2048,
                }
            ]
        }
        
        context = Mock()
        context.request_id = "test-request-id"
        
        result = lambda_handler(event, context)
        
        # Verify Bedrock was called with both images and document texts
        mock_bedrock.assert_called_once()
        call_args = mock_bedrock.call_args
        assert call_args[1]['images'] is not None
        assert call_args[1]['document_texts'] is not None
    
    @patch('handler.post_to_slack')
    @patch('handler.process_attachments')
    @patch('handler.get_thread_history')
    def test_attachment_processing_failure_handling(self, mock_thread_history, mock_process, mock_post):
        """Test handling of attachment processing failures."""
        # Mock thread history (no history)
        mock_thread_history.return_value = []
        
        # Mock attachment processing failure
        mock_process.return_value = [
            {
                "file_id": "F01234567",
                "file_name": "test.png",
                "mimetype": "image/png",
                "content_type": "image",
                "processing_status": "failed",
                "error_code": "download_failed",
                "error_message": "Failed to download file",
            }
        ]
        
        event = {
            "channel": "C01234567",
            "text": "Check this image",
            "bot_token": "xoxb-token",
            "attachments": [
                {
                    "id": "F01234567",
                    "name": "test.png",
                    "mimetype": "image/png",
                    "size": 1024,
                }
            ]
        }
        
        context = Mock()
        context.request_id = "test-request-id"
        
        # Should post error message to Slack
        with patch('handler.invoke_bedrock') as mock_bedrock:
            # If all attachments fail and no text, should post error
            result = lambda_handler(event, context)
            
            # Verify error message was posted
            mock_post.assert_called()
            # Check that error message is user-friendly
            call_args = mock_post.call_args
            error_message = call_args[0][1]  # Second argument is message
            assert "couldn't" in error_message.lower() or "failed" in error_message.lower() or "error" in error_message.lower()


class TestBackwardCompatibility:
    """Test backward compatibility with text-only messages."""
    
    @patch('handler.post_to_slack')
    @patch('handler.invoke_bedrock')
    @patch('handler.get_thread_history')
    def test_text_only_message_still_works(self, mock_thread_history, mock_bedrock, mock_post):
        """Test that text-only messages (no attachments) still work."""
        # Mock thread history (no history)
        mock_thread_history.return_value = []
        
        # Mock Bedrock response
        mock_bedrock.return_value = "Hello! How can I help you?"
        
        event = {
            "channel": "C01234567",
            "text": "Hello, bot!",
            "bot_token": "xoxb-token",
            # No attachments
        }
        
        context = Mock()
        context.request_id = "test-request-id"
        
        result = lambda_handler(event, context)
        
        # Verify Bedrock was called with text only (no images or documents)
        mock_bedrock.assert_called_once()
        call_args = mock_bedrock.call_args
        assert call_args[0][0] == "Hello, bot!"  # First argument is prompt
        assert call_args[1].get('images') is None or call_args[1].get('images') == []
        assert call_args[1].get('document_texts') is None or call_args[1].get('document_texts') == []
        
        # Verify response was posted
        mock_post.assert_called_once()
    
    @patch('handler.post_to_slack')
    @patch('handler.invoke_bedrock')
    @patch('handler.process_attachments')
    @patch('handler.get_thread_history')
    def test_empty_attachments_array(self, mock_thread_history, mock_process, mock_bedrock, mock_post):
        """Test that empty attachments array is handled correctly."""
        # Mock thread history (no history)
        mock_thread_history.return_value = []
        
        # Mock attachment processing (empty result)
        mock_process.return_value = []
        
        # Mock Bedrock response
        mock_bedrock.return_value = "Hello! How can I help you?"
        
        event = {
            "channel": "C01234567",
            "text": "Hello, bot!",
            "bot_token": "xoxb-token",
            "attachments": [],  # Empty array
        }
        
        context = Mock()
        context.request_id = "test-request-id"
        
        result = lambda_handler(event, context)
        
        # Should process as text-only message
        mock_bedrock.assert_called_once()
        call_args = mock_bedrock.call_args
        assert call_args[0][0] == "Hello, bot!"
        
        # Verify response was posted
        mock_post.assert_called_once()

