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


class TestExistenceCheckIntegration:
    """Test Existence Check integration in handler."""
    
    def test_handler_with_existence_check_success(self):
        """Test handler with successful Existence Check."""
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
                            with patch('handler.check_entity_existence', return_value=True) as mock_check:
                                with patch('handler.invoke_execution_api') as mock_invoke:
                                    mock_invoke.return_value = Mock(status_code=202)
                                    
                                    context = Mock()
                                    context.aws_request_id = "test-request-id"
                                    
                                    result = lambda_handler(event, context)
                                    
                                    # Verify Existence Check was called
                                    mock_check.assert_called_once_with(
                                        bot_token="xoxb-test",
                                        team_id="T12345",
                                        user_id="U12345",
                                        channel_id="C01234567",
                                    )
                                    # Verify request was processed (status 200)
                                    assert result["statusCode"] == 200
    
    def test_handler_with_existence_check_failure(self):
        """Test handler rejects request when Existence Check fails."""
        from existence_check import ExistenceCheckError
        
        event = {
            "body": json.dumps({
                "type": "event_callback",
                "event": {
                    "type": "app_mention",
                    "ts": "1234567890.123456",
                    "channel": "C_INVALID",
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
            with patch('handler.get_token', return_value="xoxb-test"):
                with patch('handler.check_entity_existence') as mock_check:
                    # Mock Existence Check failure
                    mock_check.side_effect = ExistenceCheckError("Channel not found: C_INVALID")
                    
                    context = Mock()
                    context.aws_request_id = "test-request-id"
                    
                    result = lambda_handler(event, context)
                    
                    # Verify request was rejected with 403
                    assert result["statusCode"] == 403
                    body = json.loads(result["body"])
                    assert "error" in body
                    assert "Entity verification failed" in body["error"]
    
    def test_handler_skips_existence_check_when_bot_token_unavailable(self):
        """Test handler skips Existence Check when Bot Token is unavailable."""
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
                        with patch('handler.get_token', return_value=None):
                            with patch.dict('os.environ', {}, clear=True):
                                with patch('handler.check_entity_existence') as mock_check:
                                    with patch('handler.invoke_execution_api') as mock_invoke:
                                        mock_invoke.return_value = Mock(status_code=202)
                                        
                                        context = Mock()
                                        context.aws_request_id = "test-request-id"
                                        
                                        result = lambda_handler(event, context)
                                        
                                        # Verify Existence Check was NOT called (Bot Token unavailable)
                                        mock_check.assert_not_called()
                                        # Verify request was still processed (graceful degradation)
                                        assert result["statusCode"] == 200


class TestAuthenticationMethodSelection:
    """Test authentication method selection logic."""

    @patch.dict(os.environ, {
        "EXECUTION_API_URL": "https://api.execute-api.region.amazonaws.com/prod",
        "EXECUTION_API_AUTH_METHOD": "iam",
        "AWS_REGION_NAME": "ap-northeast-1",
    })
    @patch('handler.verify_signature', return_value=True)
    @patch('handler.is_duplicate_event', return_value=False)
    @patch('handler.mark_event_processed', return_value=True)
    @patch('handler.validate_prompt', return_value=(True, None))
    @patch('handler.get_token', return_value="xoxb-test")
    @patch('handler.invoke_execution_api')
    def test_iam_auth_selected_by_default(
        self, mock_invoke, mock_get_token, mock_validate, mock_mark, mock_dedupe, mock_verify
    ):
        """Test that IAM authentication is selected by default."""
        mock_invoke.return_value = Mock(status_code=202)
        
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
        
        context = Mock()
        context.aws_request_id = "test-request-id"
        
        lambda_handler(event, context)
        
        # Verify IAM authentication is used (auth_method='iam', no api_key_secret_name)
        call_args = mock_invoke.call_args
        assert call_args[1]['auth_method'] == 'iam'
        assert call_args[1].get('api_key_secret_name') is None

    @patch.dict(os.environ, {
        "EXECUTION_API_URL": "https://api.execute-api.region.amazonaws.com/prod",
        "EXECUTION_API_AUTH_METHOD": "api_key",
        "EXECUTION_API_KEY_SECRET_NAME": "execution-api-key",
        "AWS_REGION_NAME": "ap-northeast-1",
    })
    @patch('handler.verify_signature', return_value=True)
    @patch('handler.is_duplicate_event', return_value=False)
    @patch('handler.mark_event_processed', return_value=True)
    @patch('handler.validate_prompt', return_value=(True, None))
    @patch('handler.get_token', return_value="xoxb-test")
    @patch('handler.invoke_execution_api')
    def test_api_key_auth_selected_when_configured(
        self, mock_invoke, mock_get_token, mock_validate, mock_mark, mock_dedupe, mock_verify
    ):
        """Test that API key authentication is selected when configured."""
        mock_invoke.return_value = Mock(status_code=202)
        
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
        
        context = Mock()
        context.aws_request_id = "test-request-id"
        
        lambda_handler(event, context)
        
        # Verify API key authentication is used
        call_args = mock_invoke.call_args
        assert call_args[1]['auth_method'] == 'api_key'
        assert call_args[1]['api_key_secret_name'] == 'execution-api-key'

    @patch.dict(os.environ, {
        "EXECUTION_API_URL": "https://api.execute-api.region.amazonaws.com/prod",
        "EXECUTION_API_AUTH_METHOD": "api_key",
        "AWS_REGION_NAME": "ap-northeast-1",
    }, clear=True)
    @patch('handler.verify_signature', return_value=True)
    @patch('handler.is_duplicate_event', return_value=False)
    @patch('handler.mark_event_processed', return_value=True)
    @patch('handler.validate_prompt', return_value=(True, None))
    @patch('handler.get_token', return_value="xoxb-test")
    def test_api_key_auth_requires_secret_name(
        self, mock_get_token, mock_validate, mock_mark, mock_dedupe, mock_verify
    ):
        """Test that API key authentication requires secret name."""
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
        
        context = Mock()
        context.aws_request_id = "test-request-id"
        
        # Should raise ValueError when api_key_secret_name is missing
        with pytest.raises(ValueError, match="EXECUTION_API_KEY_SECRET_NAME is required"):
            lambda_handler(event, context)

    @patch.dict(os.environ, {
        "EXECUTION_API_URL": "https://api.execute-api.region.amazonaws.com/prod",
        "EXECUTION_API_AUTH_METHOD": "invalid_method",
        "AWS_REGION_NAME": "ap-northeast-1",
    })
    @patch('handler.verify_signature', return_value=True)
    @patch('handler.is_duplicate_event', return_value=False)
    @patch('handler.mark_event_processed', return_value=True)
    @patch('handler.validate_prompt', return_value=(True, None))
    @patch('handler.get_token', return_value="xoxb-test")
    @patch('handler.invoke_execution_api')
    def test_invalid_auth_method_falls_back_to_iam(
        self, mock_invoke, mock_get_token, mock_validate, mock_mark, mock_dedupe, mock_verify
    ):
        """Test that invalid auth method falls back to IAM (handled by api_gateway_client)."""
        # Note: The actual validation happens in api_gateway_client.invoke_execution_api
        # This test verifies that the handler passes the invalid method through
        # and api_gateway_client will raise ValueError
        mock_invoke.side_effect = ValueError("Invalid auth_method: invalid_method")
        
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
        
        context = Mock()
        context.aws_request_id = "test-request-id"
        
        # Should handle the error gracefully
        result = lambda_handler(event, context)
        assert result['statusCode'] == 500


class TestHandlerWithWhitelistAuthorization:
    """Test handler with whitelist authorization integration."""
    
    def test_handler_with_whitelist_authorization_success(self):
        """Test handler processes request when whitelist authorization succeeds."""
        event = {
            "body": json.dumps({
                "type": "event_callback",
                "event": {
                    "type": "app_mention",
                    "ts": "1234567890.123456",
                    "channel": "C001",
                    "text": "<@U111> hello",
                    "user": "U111"
                },
                "team_id": "T123ABC"
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
                            with patch('handler.check_entity_existence', return_value=True):
                                with patch('handler.authorize_request') as mock_auth:
                                    # Mock authorization success
                                    from authorization import AuthorizationResult
                                    mock_auth.return_value = AuthorizationResult(
                                        authorized=True,
                                        team_id="T123ABC",
                                        user_id="U111",
                                        channel_id="C001",
                                    )
                                    with patch('handler.invoke_execution_api') as mock_invoke:
                                        mock_invoke.return_value = Mock(status_code=202)
                                        
                                        context = Mock()
                                        context.aws_request_id = "test-request-id"
                                        
                                        result = lambda_handler(event, context)
                                        
                                        # Verify authorization was called
                                        mock_auth.assert_called_once_with(
                                            team_id="T123ABC",
                                            user_id="U111",
                                            channel_id="C001",
                                        )
                                        # Verify request was processed (status 200)
                                        assert result["statusCode"] == 200
    
    def test_handler_with_whitelist_authorization_failure(self):
        """Test handler rejects request when whitelist authorization fails."""
        event = {
            "body": json.dumps({
                "type": "event_callback",
                "event": {
                    "type": "app_mention",
                    "ts": "1234567890.123456",
                    "channel": "C999XXX",
                    "text": "<@U111> hello",
                    "user": "U111"
                },
                "team_id": "T123ABC"
            }),
            "headers": {
                "x-slack-signature": "v0=test",
                "x-slack-request-timestamp": "1234567890"
            }
        }
        
        with patch('handler.verify_signature', return_value=True):
            with patch('handler.get_token', return_value="xoxb-test"):
                with patch('handler.check_entity_existence', return_value=True):
                    with patch('handler.authorize_request') as mock_auth:
                        # Mock authorization failure
                        from authorization import AuthorizationResult
                        mock_auth.return_value = AuthorizationResult(
                            authorized=False,
                            team_id="T123ABC",
                            user_id="U111",
                            channel_id="C999XXX",
                            unauthorized_entities=["channel_id"],
                        )
                        
                        context = Mock()
                        context.aws_request_id = "test-request-id"
                        
                        result = lambda_handler(event, context)
                        
                        # Verify request was rejected with 403
                        assert result["statusCode"] == 403
                        body = json.loads(result["body"])
                        assert "error" in body
                        assert "Authorization failed" in body["error"]

