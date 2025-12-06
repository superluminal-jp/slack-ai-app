"""
Unit tests for slack-event-handler Lambda handler.

Tests timestamp extraction and validation functionality for thread reply feature.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import json
import os

# Import handler module to test
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from handler import lambda_handler, _is_valid_timestamp


class TestTimestampValidation:
    """Test timestamp validation helper function."""
    
    def test_valid_timestamp(self):
        """Test that valid Slack timestamp format returns True."""
        assert _is_valid_timestamp("1234567890.123456") is True
        assert _is_valid_timestamp("1234567890.123") is True
        assert _is_valid_timestamp("0.0") is True
    
    def test_invalid_timestamp_formats(self):
        """Test that invalid timestamp formats return False."""
        assert _is_valid_timestamp("invalid") is False
        assert _is_valid_timestamp("1234567890") is False  # Missing decimal part
        assert _is_valid_timestamp(".123456") is False  # Missing integer part
        assert _is_valid_timestamp("1234567890.") is False  # Missing decimal part
        assert _is_valid_timestamp("123.456.789") is False  # Multiple dots
    
    def test_empty_or_none_timestamp(self):
        """Test that empty string or None returns False."""
        assert _is_valid_timestamp("") is False
        assert _is_valid_timestamp(None) is False
    
    def test_non_string_timestamp(self):
        """Test that non-string types return False."""
        assert _is_valid_timestamp(1234567890.123456) is False
        assert _is_valid_timestamp(1234567890) is False
        assert _is_valid_timestamp([]) is False
        assert _is_valid_timestamp({}) is False


class TestTimestampExtraction:
    """Test timestamp extraction from Slack events."""
    
    def test_extract_thread_ts_from_event(self):
        """Test extraction of thread_ts from Slack event."""
        event = {
            "body": json.dumps({
                "type": "event_callback",
                "event": {
                    "type": "app_mention",
                    "ts": "1234567890.123456",
                    "channel": "C01234567",
                    "text": "<@U12345> hello",
                    "user": "U12345"
                },
                "team_id": "T12345"
            }),
            "headers": {
                "x-slack-signature": "v0=test",
                "x-slack-request-timestamp": "1234567890"
            }
        }
        
        with patch('handler.verify_signature', return_value=True):
            with patch('handler.is_duplicate_event', return_value=False):
                with patch('handler.mark_event_processed', return_value=True):
                    with patch('handler.validate_prompt', return_value=(True, None)):
                        with patch('handler.get_token', return_value="xoxb-test"):
                            with patch('handler.invoke_execution_api') as mock_invoke:
                                mock_invoke.return_value = Mock(status_code=202)
                                
                                context = Mock()
                                context.aws_request_id = "test-request-id"
                                
                                result = lambda_handler(event, context)
                                
                                # Verify payload includes thread_ts
                                call_args = mock_invoke.call_args
                                payload = call_args[1]['payload']
                                assert payload['thread_ts'] == "1234567890.123456"
    
    def test_extract_thread_ts_prefers_thread_ts_over_ts(self):
        """Test that event.thread_ts is preferred over event.ts."""
        event = {
            "body": json.dumps({
                "type": "event_callback",
                "event": {
                    "type": "message",
                    "ts": "1234567890.123456",
                    "thread_ts": "1234567890.000000",  # Different timestamp
                    "channel": "C01234567",
                    "text": "hello",
                    "user": "U12345"
                },
                "team_id": "T12345"
            }),
            "headers": {
                "x-slack-signature": "v0=test",
                "x-slack-request-timestamp": "1234567890"
            }
        }
        
        with patch('handler.verify_signature', return_value=True):
            with patch('handler.is_duplicate_event', return_value=False):
                with patch('handler.mark_event_processed', return_value=True):
                    with patch('handler.validate_prompt', return_value=(True, None)):
                        with patch('handler.get_token', return_value="xoxb-test"):
                            with patch('handler.invoke_execution_api') as mock_invoke:
                                mock_invoke.return_value = Mock(status_code=202)
                                
                                context = Mock()
                                context.aws_request_id = "test-request-id"
                                
                                result = lambda_handler(event, context)
                                
                                # Verify payload uses thread_ts, not ts
                                call_args = mock_invoke.call_args
                                payload = call_args[1]['payload']
                                assert payload['thread_ts'] == "1234567890.000000"
    
    def test_missing_timestamp_handled_gracefully(self):
        """Test that missing timestamp is handled gracefully (None)."""
        event = {
            "body": json.dumps({
                "type": "event_callback",
                "event": {
                    "type": "app_mention",
                    "channel": "C01234567",
                    "text": "<@U12345> hello",
                    "user": "U12345"
                    # No ts or thread_ts
                },
                "team_id": "T12345"
            }),
            "headers": {
                "x-slack-signature": "v0=test",
                "x-slack-request-timestamp": "1234567890"
            }
        }
        
        with patch('handler.verify_signature', return_value=True):
            with patch('handler.is_duplicate_event', return_value=False):
                with patch('handler.mark_event_processed', return_value=True):
                    with patch('handler.validate_prompt', return_value=(True, None)):
                        with patch('handler.get_token', return_value="xoxb-test"):
                            with patch('handler.invoke_execution_api') as mock_invoke:
                                mock_invoke.return_value = Mock(status_code=202)
                                
                                context = Mock()
                                context.aws_request_id = "test-request-id"
                                
                                result = lambda_handler(event, context)
                                
                                # Verify payload includes None for thread_ts
                                call_args = mock_invoke.call_args
                                payload = call_args[1]['payload']
                                assert payload['thread_ts'] is None


class TestAttachmentExtraction:
    """Test attachment extraction from Slack events."""
    
    def test_extract_attachments_from_event(self):
        """Test extraction of attachments from Slack event."""
        event = {
            "body": json.dumps({
                "type": "event_callback",
                "event": {
                    "type": "app_mention",
                    "ts": "1234567890.123456",
                    "channel": "C01234567",
                    "text": "<@U12345> check this image",
                    "user": "U12345",
                    "files": [
                        {
                            "id": "F01234567",
                            "name": "test.png",
                            "mimetype": "image/png",
                            "size": 1024,
                            "url_private_download": "https://files.slack.com/...",
                        }
                    ]
                },
                "team_id": "T12345"
            }),
            "headers": {
                "x-slack-signature": "v0=test",
                "x-slack-request-timestamp": "1234567890"
            }
        }
        
        with patch('handler.verify_signature', return_value=True):
            with patch('handler.is_duplicate_event', return_value=False):
                with patch('handler.mark_event_processed', return_value=True):
                    with patch('handler.validate_prompt', return_value=(True, None)):
                        with patch('handler.get_token', return_value="xoxb-test"):
                            with patch('handler.invoke_execution_api') as mock_invoke:
                                mock_invoke.return_value = Mock(status_code=202)
                                
                                context = Mock()
                                context.aws_request_id = "test-request-id"
                                
                                result = lambda_handler(event, context)
                                
                                # Verify payload includes attachments
                                call_args = mock_invoke.call_args
                                payload = call_args[1]['payload']
                                assert 'attachments' in payload
                                assert len(payload['attachments']) == 1
                                assert payload['attachments'][0]['id'] == "F01234567"
                                assert payload['attachments'][0]['mimetype'] == "image/png"
    
    def test_event_without_attachments(self):
        """Test event without attachments (backward compatibility)."""
        event = {
            "body": json.dumps({
                "type": "event_callback",
                "event": {
                    "type": "app_mention",
                    "ts": "1234567890.123456",
                    "channel": "C01234567",
                    "text": "<@U12345> hello",
                    "user": "U12345"
                    # No files array
                },
                "team_id": "T12345"
            }),
            "headers": {
                "x-slack-signature": "v0=test",
                "x-slack-request-timestamp": "1234567890"
            }
        }
        
        with patch('handler.verify_signature', return_value=True):
            with patch('handler.is_duplicate_event', return_value=False):
                with patch('handler.mark_event_processed', return_value=True):
                    with patch('handler.validate_prompt', return_value=(True, None)):
                        with patch('handler.get_token', return_value="xoxb-test"):
                            with patch('handler.invoke_execution_api') as mock_invoke:
                                mock_invoke.return_value = Mock(status_code=202)
                                
                                context = Mock()
                                context.aws_request_id = "test-request-id"
                                
                                result = lambda_handler(event, context)
                                
                                # Verify payload includes empty attachments array
                                call_args = mock_invoke.call_args
                                payload = call_args[1]['payload']
                                assert 'attachments' in payload
                                assert payload['attachments'] == []

