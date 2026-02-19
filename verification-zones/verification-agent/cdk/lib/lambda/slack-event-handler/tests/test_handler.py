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
        
        with patch.dict(os.environ, {"VERIFICATION_AGENT_ARN": "arn:aws:bedrock-agentcore:ap-northeast-1:123:runtime/test"}, clear=False):
            with patch('handler.verify_signature', return_value=True):
                with patch('handler.is_duplicate_event', return_value=False):
                    with patch('handler.mark_event_processed', return_value=True):
                        with patch('handler.validate_prompt', return_value=(True, None)):
                            with patch('handler.get_token', return_value="xoxb-test"):
                                with patch('handler.authorize_request', return_value=Mock(authorized=True, unauthorized_entities=[])):
                                    with patch('handler.check_entity_existence', return_value=True):
                                        with patch('handler.boto3.client') as mock_boto_client:
                                            mock_agentcore = Mock()
                                            mock_boto_client.return_value = mock_agentcore
                                            context = Mock()
                                            context.aws_request_id = "test-request-id"
                                            result = lambda_handler(event, context)
                                            call_kw = mock_agentcore.invoke_agent_runtime.call_args[1]
                                            prompt = json.loads(call_kw['payload'].decode('utf-8'))
                                            task_data = json.loads(prompt['prompt'])
                                            assert task_data['thread_ts'] == "1234567890.123456"
    
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
        
        with patch.dict(os.environ, {"VERIFICATION_AGENT_ARN": "arn:aws:bedrock-agentcore:ap-northeast-1:123:runtime/test"}, clear=False):
            with patch('handler.verify_signature', return_value=True):
                with patch('handler.is_duplicate_event', return_value=False):
                    with patch('handler.mark_event_processed', return_value=True):
                        with patch('handler.validate_prompt', return_value=(True, None)):
                            with patch('handler.get_token', return_value="xoxb-test"):
                                with patch('handler.authorize_request', return_value=Mock(authorized=True, unauthorized_entities=[])):
                                    with patch('handler.check_entity_existence', return_value=True):
                                        with patch('handler.boto3.client') as mock_boto_client:
                                            mock_agentcore = Mock()
                                            mock_boto_client.return_value = mock_agentcore
                                            context = Mock()
                                            context.aws_request_id = "test-request-id"
                                            result = lambda_handler(event, context)
                                            call_kw = mock_agentcore.invoke_agent_runtime.call_args[1]
                                            prompt = json.loads(call_kw['payload'].decode('utf-8'))
                                            task_data = json.loads(prompt['prompt'])
                                            assert task_data['thread_ts'] == "1234567890.000000"
    
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
        
        with patch.dict(os.environ, {"VERIFICATION_AGENT_ARN": "arn:aws:bedrock-agentcore:ap-northeast-1:123:runtime/test"}, clear=False):
            with patch('handler.verify_signature', return_value=True):
                with patch('handler.is_duplicate_event', return_value=False):
                    with patch('handler.mark_event_processed', return_value=True):
                        with patch('handler.validate_prompt', return_value=(True, None)):
                            with patch('handler.get_token', return_value="xoxb-test"):
                                with patch('handler.authorize_request', return_value=Mock(authorized=True, unauthorized_entities=[])):
                                    with patch('handler.check_entity_existence', return_value=True):
                                        with patch('handler.boto3.client') as mock_boto_client:
                                            mock_agentcore = Mock()
                                            mock_boto_client.return_value = mock_agentcore
                                            context = Mock()
                                            context.aws_request_id = "test-request-id"
                                            result = lambda_handler(event, context)
                                            call_kw = mock_agentcore.invoke_agent_runtime.call_args[1]
                                            prompt = json.loads(call_kw['payload'].decode('utf-8'))
                                            task_data = json.loads(prompt['prompt'])
                                            assert task_data['thread_ts'] is None


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
        
        with patch.dict(os.environ, {"VERIFICATION_AGENT_ARN": "arn:aws:bedrock-agentcore:ap-northeast-1:123:runtime/test"}, clear=False):
            with patch('handler.verify_signature', return_value=True):
                with patch('handler.is_duplicate_event', return_value=False):
                    with patch('handler.mark_event_processed', return_value=True):
                        with patch('handler.validate_prompt', return_value=(True, None)):
                            with patch('handler.get_token', return_value="xoxb-test"):
                                with patch('handler.authorize_request', return_value=Mock(authorized=True, unauthorized_entities=[])):
                                    with patch('handler.check_entity_existence', return_value=True):
                                        with patch('handler.boto3.client') as mock_boto_client:
                                            mock_agentcore = Mock()
                                            mock_boto_client.return_value = mock_agentcore
                                            context = Mock()
                                            context.aws_request_id = "test-request-id"
                                            result = lambda_handler(event, context)
                                            call_kw = mock_agentcore.invoke_agent_runtime.call_args[1]
                                            prompt = json.loads(call_kw['payload'].decode('utf-8'))
                                            task_data = json.loads(prompt['prompt'])
                                            assert 'attachments' in task_data
                                            assert len(task_data['attachments']) == 1
                                            assert task_data['attachments'][0]['id'] == "F01234567"
                                            assert task_data['attachments'][0]['mimetype'] == "image/png"
    
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
        
        with patch.dict(os.environ, {"VERIFICATION_AGENT_ARN": "arn:aws:bedrock-agentcore:ap-northeast-1:123:runtime/test"}, clear=False):
            with patch('handler.verify_signature', return_value=True):
                with patch('handler.is_duplicate_event', return_value=False):
                    with patch('handler.mark_event_processed', return_value=True):
                        with patch('handler.validate_prompt', return_value=(True, None)):
                            with patch('handler.get_token', return_value="xoxb-test"):
                                with patch('handler.authorize_request', return_value=Mock(authorized=True, unauthorized_entities=[])):
                                    with patch('handler.check_entity_existence', return_value=True):
                                        with patch('handler.boto3.client') as mock_boto_client:
                                            mock_agentcore = Mock()
                                            mock_boto_client.return_value = mock_agentcore
                                            context = Mock()
                                            context.aws_request_id = "test-request-id"
                                            result = lambda_handler(event, context)
                                            call_kw = mock_agentcore.invoke_agent_runtime.call_args[1]
                                            prompt = json.loads(call_kw['payload'].decode('utf-8'))
                                            task_data = json.loads(prompt['prompt'])
                                            assert 'attachments' in task_data
                                            assert task_data['attachments'] == []


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
                                with patch.dict(os.environ, {"VERIFICATION_AGENT_ARN": "arn:aws:bedrock-agentcore:ap-northeast-1:123:runtime/test"}, clear=False):
                                    with patch('handler.boto3.client') as mock_boto_client:
                                        mock_agentcore = Mock()
                                        mock_boto_client.return_value = mock_agentcore
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
                                with patch.dict(os.environ, {"VERIFICATION_AGENT_ARN": "arn:aws:bedrock-agentcore:ap-northeast-1:123:runtime/test"}, clear=False):
                                    with patch('handler.check_entity_existence') as mock_check:
                                        with patch('handler.boto3.client') as mock_boto_client:
                                            mock_agentcore = Mock()
                                            mock_boto_client.return_value = mock_agentcore
                                            context = Mock()
                                            context.aws_request_id = "test-request-id"
                                            result = lambda_handler(event, context)
                                            mock_check.assert_not_called()
                                            assert result["statusCode"] == 200


class TestAuthenticationMethodSelection:
    """Test A2A path: handler uses VERIFICATION_AGENT_ARN and bedrock-agentcore."""

    @patch.dict(os.environ, {
        "VERIFICATION_AGENT_ARN": "arn:aws:bedrock-agentcore:ap-northeast-1:123:runtime/test",
        "AWS_REGION_NAME": "ap-northeast-1",
    })
    @patch('handler.verify_signature', return_value=True)
    @patch('handler.is_duplicate_event', return_value=False)
    @patch('handler.mark_event_processed', return_value=True)
    @patch('handler.validate_prompt', return_value=(True, None))
    @patch('handler.get_token', return_value="xoxb-test")
    @patch('handler.authorize_request', return_value=Mock(authorized=True, unauthorized_entities=[]))
    @patch('handler.check_entity_existence', return_value=True)
    @patch('handler.boto3.client')
    def test_iam_auth_selected_by_default(
        self, mock_boto_client, mock_check_entity, mock_auth, mock_get_token, mock_validate, mock_mark, mock_dedupe, mock_verify
    ):
        """Test that handler invokes AgentCore (A2A path) when VERIFICATION_AGENT_ARN is set."""
        mock_agentcore = Mock()
        mock_boto_client.return_value = mock_agentcore
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
        mock_agentcore.invoke_agent_runtime.assert_called_once()

    @patch.dict(os.environ, {
        "VERIFICATION_AGENT_ARN": "arn:aws:bedrock-agentcore:ap-northeast-1:123:runtime/test",
        "AWS_REGION_NAME": "ap-northeast-1",
    })
    @patch('handler.verify_signature', return_value=True)
    @patch('handler.is_duplicate_event', return_value=False)
    @patch('handler.mark_event_processed', return_value=True)
    @patch('handler.validate_prompt', return_value=(True, None))
    @patch('handler.get_token', return_value="xoxb-test")
    @patch('handler.authorize_request', return_value=Mock(authorized=True, unauthorized_entities=[]))
    @patch('handler.check_entity_existence', return_value=True)
    @patch('handler.boto3.client')
    def test_api_key_auth_selected_when_configured(
        self, mock_boto_client, mock_check_entity, mock_auth, mock_get_token, mock_validate, mock_mark, mock_dedupe, mock_verify
    ):
        """Test that handler invokes AgentCore when VERIFICATION_AGENT_ARN is set."""
        mock_agentcore = Mock()
        mock_boto_client.return_value = mock_agentcore
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
        mock_agentcore.invoke_agent_runtime.assert_called_once()

    @patch.dict(os.environ, {
        "VERIFICATION_AGENT_ARN": "",
        "AWS_REGION_NAME": "ap-northeast-1",
    }, clear=False)
    @patch('handler.verify_signature', return_value=True)
    @patch('handler.is_duplicate_event', return_value=False)
    @patch('handler.mark_event_processed', return_value=True)
    @patch('handler.validate_prompt', return_value=(True, None))
    @patch('handler.get_token', return_value="xoxb-test")
    @patch('handler.authorize_request', return_value=Mock(authorized=True, unauthorized_entities=[]))
    @patch('handler.check_entity_existence', return_value=True)
    def test_api_key_auth_requires_secret_name(
        self, mock_check_entity, mock_auth, mock_get_token, mock_validate, mock_mark, mock_dedupe, mock_verify
    ):
        """A2A: When VERIFICATION_AGENT_ARN is missing, handler returns 200 without calling AgentCore."""
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
        with patch('handler.boto3.client') as mock_boto_client:
            result = lambda_handler(event, context)
        assert result["statusCode"] == 200
        mock_boto_client.assert_not_called()

    @patch.dict(os.environ, {
        "VERIFICATION_AGENT_ARN": "arn:aws:bedrock-agentcore:ap-northeast-1:123:runtime/test",
        "AWS_REGION_NAME": "ap-northeast-1",
    })
    @patch('handler.verify_signature', return_value=True)
    @patch('handler.is_duplicate_event', return_value=False)
    @patch('handler.mark_event_processed', return_value=True)
    @patch('handler.validate_prompt', return_value=(True, None))
    @patch('handler.get_token', return_value="xoxb-test")
    @patch('handler.authorize_request', return_value=Mock(authorized=True, unauthorized_entities=[]))
    @patch('handler.check_entity_existence', return_value=True)
    @patch('handler.boto3.client')
    def test_invalid_auth_method_falls_back_to_iam(
        self, mock_boto_client, mock_check_entity, mock_auth, mock_get_token, mock_validate, mock_mark, mock_dedupe, mock_verify
    ):
        """A2A: When invoke_agent_runtime raises, handler still returns 200 (graceful)."""
        mock_agentcore = Mock()
        mock_agentcore.invoke_agent_runtime.side_effect = Exception("AgentCore error")
        mock_boto_client.return_value = mock_agentcore
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
        result = lambda_handler(event, context)
        assert result["statusCode"] == 200


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
                                    from authorization import AuthorizationResult
                                    mock_auth.return_value = AuthorizationResult(
                                        authorized=True,
                                        team_id="T123ABC",
                                        user_id="U111",
                                        channel_id="C001",
                                    )
                                    with patch.dict(os.environ, {"VERIFICATION_AGENT_ARN": "arn:aws:bedrock-agentcore:ap-northeast-1:123:runtime/test"}, clear=False):
                                        with patch('handler.boto3.client') as mock_boto_client:
                                            mock_agentcore = Mock()
                                            mock_boto_client.return_value = mock_agentcore
                                            context = Mock()
                                            context.aws_request_id = "test-request-id"
                                            result = lambda_handler(event, context)
                                    mock_auth.assert_called_once_with(
                                        team_id="T123ABC",
                                        user_id="U111",
                                        channel_id="C001",
                                    )
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


class Test016AsyncSqsPath:
    """016: When AGENT_INVOCATION_QUEUE_URL is set, handler sends to SQS and must NOT call InvokeAgentRuntime."""

    def test_app_mention_sends_to_sqs_and_returns_200_when_queue_url_set(self):
        """When AGENT_INVOCATION_QUEUE_URL is set, handler calls sqs.send_message with AgentInvocationRequest shape and returns 200; must NOT call invoke_agent_runtime."""
        event = {
            "body": json.dumps({
                "type": "event_callback",
                "event_id": "Ev016Test001",
                "event": {
                    "type": "app_mention",
                    "ts": "1234567890.123456",
                    "channel": "C01234567",
                    "text": "<@U12345> hello",
                    "user": "U12345",
                },
                "team_id": "T12345",
            }),
            "headers": {
                "x-slack-signature": "v0=test",
                "x-slack-request-timestamp": "1234567890",
            },
        }
        mock_sqs = Mock()
        mock_sqs.send_message.return_value = {"MessageId": "msg-123"}
        mock_agentcore = Mock()

        def boto_client(service_name, **kwargs):
            if service_name == "sqs":
                return mock_sqs
            if service_name == "bedrock-agentcore":
                return mock_agentcore
            return Mock()

        env = {
            "AGENT_INVOCATION_QUEUE_URL": "https://sqs.ap-northeast-1.amazonaws.com/123456789012/agent-invocation-request",
            "VERIFICATION_AGENT_ARN": "arn:aws:bedrock-agentcore:ap-northeast-1:123:runtime/test",
            "AWS_REGION_NAME": "ap-northeast-1",
        }
        with patch.dict(os.environ, env, clear=False):
            with patch("handler.verify_signature", return_value=True):
                with patch("handler.is_duplicate_event", return_value=False):
                    with patch("handler.mark_event_processed", return_value=True):
                        with patch("handler.validate_prompt", return_value=(True, None)):
                            with patch("handler.get_token", return_value="xoxb-test"):
                                with patch(
                                    "handler.authorize_request",
                                    return_value=Mock(authorized=True, unauthorized_entities=[]),
                                ):
                                    with patch("handler.check_entity_existence", return_value=True):
                                        with patch("handler.check_rate_limit", return_value=(True, 10)):
                                            with patch("handler.WebClient", return_value=Mock()):
                                                with patch("handler.boto3.client", side_effect=boto_client):
                                                    context = Mock()
                                                    context.aws_request_id = "req-016-001"
                                                    result = lambda_handler(event, context)

        assert result["statusCode"] == 200
        mock_sqs.send_message.assert_called_once()
        call_kw = mock_sqs.send_message.call_args[1]
        assert call_kw["QueueUrl"] == env["AGENT_INVOCATION_QUEUE_URL"]
        body = json.loads(call_kw["MessageBody"])
        assert body["channel"] == "C01234567"
        assert body["text"] == "hello"
        assert body["thread_ts"] == "1234567890.123456"
        assert body["event_id"] == "Ev016Test001"
        assert body["correlation_id"] == "req-016-001"
        assert body["team_id"] == "T12345"
        assert body["user_id"] == "U12345"
        mock_agentcore.invoke_agent_runtime.assert_not_called()

    def test_sqs_send_failure_returns_500_and_no_invoke_agent_runtime(self):
        """When SQS send_message raises, handler returns statusCode 500 and does not call invoke_agent_runtime."""
        event = {
            "body": json.dumps({
                "type": "event_callback",
                "event_id": "Ev016Test002",
                "event": {
                    "type": "app_mention",
                    "ts": "1234567890.123456",
                    "channel": "C01234567",
                    "text": "<@U12345> hi",
                    "user": "U12345",
                },
                "team_id": "T12345",
            }),
            "headers": {
                "x-slack-signature": "v0=test",
                "x-slack-request-timestamp": "1234567890",
            },
        }
        mock_sqs = Mock()
        mock_sqs.send_message.side_effect = Exception("SQS unavailable")
        mock_agentcore = Mock()

        def boto_client(service_name, **kwargs):
            if service_name == "sqs":
                return mock_sqs
            if service_name == "bedrock-agentcore":
                return mock_agentcore
            return Mock()

        env = {
            "AGENT_INVOCATION_QUEUE_URL": "https://sqs.ap-northeast-1.amazonaws.com/123456789012/agent-invocation-request",
            "VERIFICATION_AGENT_ARN": "arn:aws:bedrock-agentcore:ap-northeast-1:123:runtime/test",
            "AWS_REGION_NAME": "ap-northeast-1",
        }
        with patch.dict(os.environ, env, clear=False):
            with patch("handler.verify_signature", return_value=True):
                with patch("handler.is_duplicate_event", return_value=False):
                    with patch("handler.mark_event_processed", return_value=True):
                        with patch("handler.validate_prompt", return_value=(True, None)):
                            with patch("handler.get_token", return_value="xoxb-test"):
                                with patch(
                                    "handler.authorize_request",
                                    return_value=Mock(authorized=True, unauthorized_entities=[]),
                                ):
                                    with patch("handler.check_entity_existence", return_value=True):
                                        with patch("handler.check_rate_limit", return_value=(True, 10)):
                                            with patch("handler.WebClient", return_value=Mock()):
                                                with patch("handler.boto3.client", side_effect=boto_client):
                                                    context = Mock()
                                                    context.aws_request_id = "req-016-002"
                                                    result = lambda_handler(event, context)

        assert result["statusCode"] == 500
        mock_agentcore.invoke_agent_runtime.assert_not_called()

