"""Secrets Manager クライアントのユニットテスト"""

import sys
import os
import pytest
from unittest.mock import Mock, patch, MagicMock
from botocore.exceptions import ClientError

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from secrets_manager_client import (
    get_secret,
    get_api_key,
    SecretNotFoundError,
    InvalidSecretFormatError,
    SecretsManagerError,
)


@patch("secrets_manager_client.boto3.client")
def test_get_secret_json(mock_boto3_client):
    """JSON 形式のシークレットを取得するテスト"""
    mock_client = Mock()
    mock_client.get_secret_value.return_value = {
        "SecretString": '{"api_key": "test-api-key-123"}'
    }
    mock_boto3_client.return_value = mock_client

    result = get_secret("test-secret")

    assert result == {"api_key": "test-api-key-123"}
    mock_client.get_secret_value.assert_called_once_with(SecretId="test-secret")


@patch("secrets_manager_client.boto3.client")
def test_get_secret_string(mock_boto3_client):
    """文字列形式のシークレットを取得するテスト"""
    mock_client = Mock()
    mock_client.get_secret_value.return_value = {
        "SecretString": "plain-text-secret"
    }
    mock_boto3_client.return_value = mock_client

    result = get_secret("test-secret")

    assert result == {"value": "plain-text-secret"}
    mock_client.get_secret_value.assert_called_once_with(SecretId="test-secret")


@patch("secrets_manager_client.boto3.client")
def test_get_api_key_from_json(mock_boto3_client):
    """JSON 形式から API キーを取得するテスト"""
    mock_client = Mock()
    mock_client.get_secret_value.return_value = {
        "SecretString": '{"api_key": "test-api-key-123"}'
    }
    mock_boto3_client.return_value = mock_client

    result = get_api_key("test-secret")

    assert result == "test-api-key-123"


@patch("secrets_manager_client.boto3.client")
def test_get_api_key_from_value_field(mock_boto3_client):
    """value フィールドから API キーを取得するテスト"""
    mock_client = Mock()
    mock_client.get_secret_value.return_value = {
        "SecretString": '{"value": "test-api-key-456"}'
    }
    mock_boto3_client.return_value = mock_client

    result = get_api_key("test-secret")

    assert result == "test-api-key-456"


@patch("secrets_manager_client.boto3.client")
def test_get_secret_not_found(mock_boto3_client):
    """シークレットが見つからない場合のテスト"""
    mock_client = Mock()
    error_response = {
        "Error": {
            "Code": "ResourceNotFoundException",
            "Message": "Secret not found",
        }
    }
    mock_client.get_secret_value.side_effect = ClientError(
        error_response, "GetSecretValue"
    )
    mock_boto3_client.return_value = mock_client

    with pytest.raises(SecretNotFoundError, match="Secret test-secret not found"):
        get_secret("test-secret")


@patch("secrets_manager_client.boto3.client")
def test_get_api_key_not_found(mock_boto3_client):
    """API キーが見つからない場合のテスト"""
    mock_client = Mock()
    mock_client.get_secret_value.return_value = {
        "SecretString": '{"other_field": "value"}'
    }
    mock_boto3_client.return_value = mock_client

    with pytest.raises(
        InvalidSecretFormatError,
        match="API key not found in secret. Expected 'api_key' or 'value' field.",
    ):
        get_api_key("test-secret")


@patch("secrets_manager_client.boto3.client")
def test_get_api_key_invalid_format(mock_boto3_client):
    """無効な API キー形式のテスト"""
    mock_client = Mock()
    mock_client.get_secret_value.return_value = {
        "SecretString": '{"api_key": null}'
    }
    mock_boto3_client.return_value = mock_client

    with pytest.raises(
        InvalidSecretFormatError, match="Invalid API key format. Expected string"
    ):
        get_api_key("test-secret")


@patch("secrets_manager_client.boto3.client")
def test_get_secret_invalid_parameter(mock_boto3_client):
    """無効なパラメータの場合のテスト"""
    mock_client = Mock()
    error_response = {
        "Error": {
            "Code": "InvalidParameterException",
            "Message": "Invalid parameter",
        }
    }
    mock_client.get_secret_value.side_effect = ClientError(
        error_response, "GetSecretValue"
    )
    mock_boto3_client.return_value = mock_client

    with pytest.raises(InvalidSecretFormatError):
        get_secret("test-secret")


@patch("secrets_manager_client.boto3.client")
def test_get_secret_decryption_failure(mock_boto3_client):
    """復号化失敗の場合のテスト"""
    mock_client = Mock()
    error_response = {
        "Error": {
            "Code": "DecryptionFailureException",
            "Message": "Decryption failed",
        }
    }
    mock_client.get_secret_value.side_effect = ClientError(
        error_response, "GetSecretValue"
    )
    mock_boto3_client.return_value = mock_client

    with pytest.raises(SecretsManagerError, match="Failed to decrypt secret"):
        get_secret("test-secret")


@patch("secrets_manager_client.boto3.client")
def test_get_api_key_empty_string(mock_boto3_client):
    """空文字列の API キーのテスト"""
    mock_client = Mock()
    mock_client.get_secret_value.return_value = {
        "SecretString": '{"api_key": ""}'
    }
    mock_boto3_client.return_value = mock_client

    with pytest.raises(
        InvalidSecretFormatError, match="Invalid API key format. Expected string"
    ):
        get_api_key("test-secret")

