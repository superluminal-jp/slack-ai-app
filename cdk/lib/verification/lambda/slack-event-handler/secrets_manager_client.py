"""
AWS Secrets Manager クライアント

API キーなどのシークレットを安全に取得するためのモジュール
"""

import json
import os
from typing import Dict, Any, Optional
import boto3
from botocore.exceptions import ClientError


class SecretsManagerError(Exception):
    """Base exception for Secrets Manager errors."""

    pass


class SecretNotFoundError(SecretsManagerError):
    """Raised when a secret is not found in Secrets Manager."""

    def __init__(self, secret_name: str):
        self.secret_name = secret_name
        self.message = f"Secret {secret_name} not found"
        super().__init__(self.message)


class InvalidSecretFormatError(SecretsManagerError):
    """Raised when secret format is invalid."""

    def __init__(self, secret_name: str, reason: str):
        self.secret_name = secret_name
        self.reason = reason
        self.message = f"Invalid secret format for {secret_name}: {reason}"
        super().__init__(self.message)


def get_secret(secret_name: str, region: str = "ap-northeast-1") -> Dict[str, Any]:
    """
    AWS Secrets Manager からシークレットを取得

    Args:
        secret_name: Secrets Manager のシークレット名
        region: AWS リージョン

    Returns:
        シークレットの辞書（JSON 文字列の場合はパース済み）

    Raises:
        SecretNotFoundError: シークレットが見つからない場合
        InvalidSecretFormatError: シークレット形式が無効な場合
        SecretsManagerError: その他の Secrets Manager エラー
    """
    client = boto3.client("secretsmanager", region_name=region)

    try:
        response = client.get_secret_value(SecretId=secret_name)
        secret_string = response["SecretString"]

        # JSON 文字列の場合はパース
        try:
            return json.loads(secret_string)
        except json.JSONDecodeError:
            # JSON でない場合は文字列として返す
            return {"value": secret_string}

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code == "ResourceNotFoundException":
            raise SecretNotFoundError(secret_name) from e
        elif error_code == "InvalidParameterException":
            raise InvalidSecretFormatError(
                secret_name, f"Invalid parameter: {e.response['Error']['Message']}"
            ) from e
        elif error_code == "InvalidRequestException":
            raise InvalidSecretFormatError(
                secret_name, f"Invalid request: {e.response['Error']['Message']}"
            ) from e
        elif error_code == "DecryptionFailureException":
            raise SecretsManagerError(
                f"Failed to decrypt secret: {secret_name}"
            ) from e
        else:
            raise SecretsManagerError(
                f"Unexpected error retrieving secret {secret_name}: {error_code}"
            ) from e


def get_api_key(secret_name: str, region: str = "ap-northeast-1") -> str:
    """
    Secrets Manager から API キーを取得

    Args:
        secret_name: Secrets Manager のシークレット名
        region: AWS リージョン

    Returns:
        API キー文字列

    Raises:
        SecretNotFoundError: シークレットが見つからない場合
        InvalidSecretFormatError: API キーが見つからない、または無効な形式の場合
        SecretsManagerError: その他の Secrets Manager エラー
    """
    secret = get_secret(secret_name, region)

    # API キーを取得（JSON オブジェクトまたは文字列）
    api_key: Optional[str] = None
    if "api_key" in secret:
        api_key = secret["api_key"]
    elif "value" in secret:
        api_key = secret["value"]
    else:
        # シークレットが直接文字列の場合（JSON でない場合）
        if isinstance(secret, str):
            api_key = secret
        else:
            raise InvalidSecretFormatError(
                secret_name, "API key not found in secret. Expected 'api_key' or 'value' field."
            )

    if not api_key or not isinstance(api_key, str):
        raise InvalidSecretFormatError(
            secret_name, f"Invalid API key format. Expected string, got {type(api_key)}"
        )

    return api_key

