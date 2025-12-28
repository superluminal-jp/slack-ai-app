"""
Token storage module for DynamoDB workspace token management.

Provides functions to store and retrieve Slack bot tokens by team_id.
"""

import os
import boto3
from typing import Optional
from botocore.exceptions import ClientError


def get_dynamodb_table():
    """
    Get DynamoDB table client for workspace tokens.

    Returns:
        boto3 DynamoDB Table resource

    Raises:
        ValueError: If TOKEN_TABLE_NAME environment variable is not set
    """
    table_name = os.environ.get('TOKEN_TABLE_NAME')
    if not table_name:
        raise ValueError('TOKEN_TABLE_NAME environment variable is required')

    dynamodb = boto3.resource('dynamodb')
    return dynamodb.Table(table_name)


def store_token(team_id: str, bot_token: str) -> None:
    """
    Store Slack bot token for a workspace in DynamoDB.

    Args:
        team_id: Slack workspace identifier (e.g., T01234567)
        bot_token: Slack bot OAuth token (e.g., xoxb-...)

    Raises:
        ClientError: If DynamoDB operation fails
        ValueError: If team_id or bot_token is invalid
    """
    if not team_id or not team_id.startswith('T'):
        raise ValueError(f'Invalid team_id format: {team_id}')
    if not bot_token or not bot_token.startswith('xoxb-'):
        raise ValueError(f'Invalid bot_token format: {bot_token}')

    table = get_dynamodb_table()
    table.put_item(
        Item={
            'team_id': team_id,
            'bot_token': bot_token,
            'installation_timestamp': int(__import__('time').time()),
        }
    )


def get_token(team_id: str) -> Optional[str]:
    """
    Retrieve Slack bot token for a workspace from DynamoDB.

    Args:
        team_id: Slack workspace identifier (e.g., T01234567)

    Returns:
        Bot token string if found, None otherwise

    Raises:
        ClientError: If DynamoDB operation fails
        ValueError: If team_id is invalid
    """
    if not team_id or not team_id.startswith('T'):
        raise ValueError(f'Invalid team_id format: {team_id}')

    table = get_dynamodb_table()
    try:
        response = table.get_item(
            Key={'team_id': team_id}
        )
        if 'Item' in response:
            return response['Item'].get('bot_token')
        return None
    except ClientError as e:
        # Log error but return None to allow fallback
        print(f"Error retrieving token from DynamoDB: {str(e)}")
        return None

