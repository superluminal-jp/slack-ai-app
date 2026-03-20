"""
Unit tests for the whitelist authorization module.

Covers:
- AuthorizationResult dataclass field extensions
- load_whitelist_config channel_labels dict population
- authorize_request log injection for channel labels
- DynamoDB label attribute parsing
- Secrets Manager object-format channel entries
- Environment variable ID:label format parsing
"""

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from authorization import (
    AuthorizationResult,
    _get_whitelist_from_dynamodb,
    _get_whitelist_from_env,
    _get_whitelist_from_secrets_manager,
    load_whitelist_config,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_dynamodb_items(entries):
    """Build a mock DynamoDB query response Items list.

    entries: list of dicts with keys entity_type, entity_id, and optional label.
    """
    items = []
    for e in entries:
        item = {
            "entity_type": {"S": e["entity_type"]},
            "entity_id": {"S": e["entity_id"]},
        }
        if "label" in e:
            item["label"] = {"S": e["label"]}
        items.append(item)
    return items


def _mock_dynamodb_responses(items_by_entity_type):
    """Return a mock DynamoDB client whose query() returns items per entity_type."""
    client = MagicMock()

    def query_side_effect(TableName, KeyConditionExpression, ExpressionAttributeValues):
        entity_type = ExpressionAttributeValues[":entity_type"]["S"]
        return {"Items": items_by_entity_type.get(entity_type, [])}

    client.query.side_effect = query_side_effect
    return client


# ---------------------------------------------------------------------------
# Phase 2: AuthorizationResult dataclass
# ---------------------------------------------------------------------------

class TestAuthorizationResultDataclass:
    """AuthorizationResult has an optional channel_label field."""

    def test_channel_label_defaults_to_none(self):
        result = AuthorizationResult(authorized=True)
        assert result.channel_label is None

    def test_channel_label_can_be_set(self):
        result = AuthorizationResult(authorized=True, channel_label="#general")
        assert result.channel_label == "#general"

    def test_channel_label_independent_of_channel_id(self):
        result = AuthorizationResult(
            authorized=True,
            channel_id="C0123456789",
            channel_label="#general",
        )
        assert result.channel_id == "C0123456789"
        assert result.channel_label == "#general"


# ---------------------------------------------------------------------------
# Phase 2: load_whitelist_config includes channel_labels
# ---------------------------------------------------------------------------

class TestLoadWhitelistConfigChannelLabels:
    """load_whitelist_config returns channel_labels dict."""

    def test_channel_labels_key_present_in_return(self):
        with patch("authorization.load_whitelist_config") as mock_load:
            mock_load.return_value = {
                "team_ids": set(),
                "user_ids": set(),
                "channel_ids": {"C001"},
                "channel_labels": {"C001": "#general"},
            }
            result = mock_load()
        assert "channel_labels" in result

    def test_channel_labels_is_dict(self):
        with patch("authorization.load_whitelist_config") as mock_load:
            mock_load.return_value = {
                "team_ids": set(),
                "user_ids": set(),
                "channel_ids": set(),
                "channel_labels": {},
            }
            result = mock_load()
        assert isinstance(result["channel_labels"], dict)


# ---------------------------------------------------------------------------
# Phase 2: authorize_request log injection
# ---------------------------------------------------------------------------

class TestAuthorizeRequestLabelLogging:
    """authorize_request injects channel_label into log events when present."""

    @patch("authorization._emit_metric")
    @patch("authorization.log_info")
    @patch("authorization.load_whitelist_config")
    def test_label_injected_into_success_log(self, mock_load, mock_log_info, mock_metric):
        mock_load.return_value = {
            "team_ids": set(),
            "user_ids": set(),
            "channel_ids": {"C001"},
            "channel_labels": {"C001": "#general"},
        }
        from authorization import authorize_request
        result = authorize_request(team_id=None, user_id=None, channel_id="C001")
        assert result.authorized is True
        assert result.channel_label == "#general"
        # channel_label present in success log call
        success_calls = [
            call for call in mock_log_info.call_args_list
            if "whitelist_authorization_success" in call.args
        ]
        assert success_calls, "whitelist_authorization_success log not emitted"
        log_data = success_calls[0].args[1]
        assert log_data.get("channel_label") == "#general"

    @patch("authorization._emit_metric")
    @patch("authorization.log_info")
    @patch("authorization.load_whitelist_config")
    def test_label_absent_from_log_when_not_set(self, mock_load, mock_log_info, mock_metric):
        mock_load.return_value = {
            "team_ids": set(),
            "user_ids": set(),
            "channel_ids": {"C001"},
            "channel_labels": {},
        }
        from authorization import authorize_request
        result = authorize_request(team_id=None, user_id=None, channel_id="C001")
        assert result.authorized is True
        assert result.channel_label is None
        success_calls = [
            call for call in mock_log_info.call_args_list
            if "whitelist_authorization_success" in call.args
        ]
        assert success_calls
        log_data = success_calls[0].args[1]
        assert "channel_label" not in log_data

    @patch("authorization._emit_metric")
    @patch("authorization.log_error")
    @patch("authorization.load_whitelist_config")
    def test_label_injected_into_failure_log(self, mock_load, mock_log_error, mock_metric):
        mock_load.return_value = {
            "team_ids": {"T001"},
            "user_ids": set(),
            "channel_ids": {"C001"},
            "channel_labels": {"C001": "#general"},
        }
        from authorization import authorize_request
        result = authorize_request(team_id="T_UNAUTHORIZED", user_id=None, channel_id="C001")
        assert result.authorized is False
        assert result.channel_label == "#general"
        failure_calls = [
            call for call in mock_log_error.call_args_list
            if "whitelist_authorization_failed" in call.args
        ]
        assert failure_calls, "whitelist_authorization_failed log not emitted"
        log_data = failure_calls[0].args[1]
        assert log_data.get("channel_label") == "#general"


# ---------------------------------------------------------------------------
# Phase 3: DynamoDB label parsing
# ---------------------------------------------------------------------------

class TestDynamoDBLabelParsing:
    """_get_whitelist_from_dynamodb parses optional label attribute."""

    @patch.dict(os.environ, {"WHITELIST_TABLE_NAME": "test-whitelist"})
    @patch("authorization.boto3")
    def test_label_attribute_populates_channel_labels(self, mock_boto3):
        items = {
            "channel_id": _make_dynamodb_items([
                {"entity_type": "channel_id", "entity_id": "C001", "label": "#general"},
                {"entity_type": "channel_id", "entity_id": "C002"},
            ]),
            "team_id": [],
            "user_id": [],
        }
        mock_boto3.client.return_value = _mock_dynamodb_responses(items)
        result = _get_whitelist_from_dynamodb()
        assert result["channel_labels"] == {"C001": "#general"}
        assert result["channel_ids"] == {"C001", "C002"}

    @patch.dict(os.environ, {"WHITELIST_TABLE_NAME": "test-whitelist"})
    @patch("authorization.boto3")
    def test_item_without_label_not_in_channel_labels(self, mock_boto3):
        items = {
            "channel_id": _make_dynamodb_items([
                {"entity_type": "channel_id", "entity_id": "C001"},
            ]),
            "team_id": [],
            "user_id": [],
        }
        mock_boto3.client.return_value = _mock_dynamodb_responses(items)
        result = _get_whitelist_from_dynamodb()
        assert "C001" not in result["channel_labels"]
        assert "C001" in result["channel_ids"]

    @patch.dict(os.environ, {"WHITELIST_TABLE_NAME": "test-whitelist"})
    @patch("authorization.boto3")
    def test_empty_string_label_not_in_channel_labels(self, mock_boto3):
        items = {
            "channel_id": _make_dynamodb_items([
                {"entity_type": "channel_id", "entity_id": "C001", "label": ""},
            ]),
            "team_id": [],
            "user_id": [],
        }
        mock_boto3.client.return_value = _mock_dynamodb_responses(items)
        result = _get_whitelist_from_dynamodb()
        assert "C001" not in result["channel_labels"]
        assert "C001" in result["channel_ids"]

    @patch.dict(os.environ, {"WHITELIST_TABLE_NAME": "test-whitelist"})
    @patch("authorization.boto3")
    def test_channel_labels_empty_when_no_labels(self, mock_boto3):
        items = {
            "channel_id": _make_dynamodb_items([
                {"entity_type": "channel_id", "entity_id": "C001"},
                {"entity_type": "channel_id", "entity_id": "C002"},
            ]),
            "team_id": [],
            "user_id": [],
        }
        mock_boto3.client.return_value = _mock_dynamodb_responses(items)
        result = _get_whitelist_from_dynamodb()
        assert result["channel_labels"] == {}


# ---------------------------------------------------------------------------
# Phase 4: Secrets Manager object-format parsing
# ---------------------------------------------------------------------------

class TestSecretsManagerObjectFormat:
    """_get_whitelist_from_secrets_manager handles object-format channel entries."""

    def _build_secret_response(self, secret_data):
        import json
        client = MagicMock()
        client.get_secret_value.return_value = {"SecretString": json.dumps(secret_data)}
        return client

    @patch.dict(os.environ, {"WHITELIST_SECRET_NAME": "test-secret"})
    @patch("authorization.boto3")
    def test_object_format_populates_channel_labels(self, mock_boto3):
        mock_boto3.client.return_value = self._build_secret_response({
            "team_ids": [],
            "user_ids": [],
            "channel_ids": [{"id": "C001", "label": "#general"}, "C002"],
        })
        result = _get_whitelist_from_secrets_manager()
        assert result["channel_ids"] == {"C001", "C002"}
        assert result["channel_labels"] == {"C001": "#general"}

    @patch.dict(os.environ, {"WHITELIST_SECRET_NAME": "test-secret"})
    @patch("authorization.boto3")
    def test_string_format_backward_compat(self, mock_boto3):
        mock_boto3.client.return_value = self._build_secret_response({
            "team_ids": [],
            "user_ids": [],
            "channel_ids": ["C001", "C002"],
        })
        result = _get_whitelist_from_secrets_manager()
        assert result["channel_ids"] == {"C001", "C002"}
        assert result["channel_labels"] == {}

    @patch.dict(os.environ, {"WHITELIST_SECRET_NAME": "test-secret"})
    @patch("authorization.boto3")
    def test_mixed_format_handles_both(self, mock_boto3):
        mock_boto3.client.return_value = self._build_secret_response({
            "team_ids": [],
            "user_ids": [],
            "channel_ids": ["C001", {"id": "C002", "label": "#ops"}],
        })
        result = _get_whitelist_from_secrets_manager()
        assert result["channel_ids"] == {"C001", "C002"}
        assert result["channel_labels"] == {"C002": "#ops"}

    @patch.dict(os.environ, {"WHITELIST_SECRET_NAME": "test-secret"})
    @patch("authorization.boto3")
    def test_object_without_label_key_ignored_in_channel_labels(self, mock_boto3):
        mock_boto3.client.return_value = self._build_secret_response({
            "team_ids": [],
            "user_ids": [],
            "channel_ids": [{"id": "C001"}],
        })
        result = _get_whitelist_from_secrets_manager()
        assert "C001" in result["channel_ids"]
        assert "C001" not in result["channel_labels"]


# ---------------------------------------------------------------------------
# Phase 6: Env var ID:label parsing
# ---------------------------------------------------------------------------

class TestEnvVarLabelParsing:
    """_get_whitelist_from_env parses ID:label format in WHITELIST_CHANNEL_IDS."""

    @patch.dict(os.environ, {"WHITELIST_CHANNEL_IDS": "C001:#general,C002:#ops,C003"})
    def test_id_label_format_populates_channel_labels(self):
        result = _get_whitelist_from_env()
        assert result["channel_ids"] == {"C001", "C002", "C003"}
        assert result["channel_labels"] == {"C001": "#general", "C002": "#ops"}

    @patch.dict(os.environ, {"WHITELIST_CHANNEL_IDS": "C001,C002"})
    def test_plain_format_backward_compat(self):
        result = _get_whitelist_from_env()
        assert result["channel_ids"] == {"C001", "C002"}
        assert result["channel_labels"] == {}

    @patch.dict(os.environ, {"WHITELIST_CHANNEL_IDS": "C001:"})
    def test_empty_label_suffix_not_in_channel_labels(self):
        result = _get_whitelist_from_env()
        assert "C001" in result["channel_ids"]
        assert "C001" not in result["channel_labels"]

    @patch.dict(os.environ, {"WHITELIST_CHANNEL_IDS": ""})
    def test_empty_env_var_returns_empty_labels(self):
        result = _get_whitelist_from_env()
        assert result["channel_ids"] == set()
        assert result["channel_labels"] == {}
