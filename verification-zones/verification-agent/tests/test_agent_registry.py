"""Unit tests for agent_registry.py — DynamoDB-based agent registry."""

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


# ---------------------------------------------------------------------------
# AgentSkill Pydantic model validation
# ---------------------------------------------------------------------------
class TestAgentSkillModel:
    def test_valid_skill(self):
        from agent_registry import AgentSkill

        skill = AgentSkill(id="current-time", name="Current Time", description="Get current time")
        assert skill.id == "current-time"
        assert skill.name == "Current Time"
        assert skill.description == "Get current time"

    def test_skill_description_defaults_empty(self):
        from agent_registry import AgentSkill

        skill = AgentSkill(id="s1", name="Skill One")
        assert skill.description == ""

    def test_skill_missing_required_field(self):
        from pydantic import ValidationError
        from agent_registry import AgentSkill

        with pytest.raises(ValidationError):
            AgentSkill(id="s1")  # missing name


# ---------------------------------------------------------------------------
# AgentRegistryEntry Pydantic model validation
# ---------------------------------------------------------------------------
class TestAgentRegistryEntryModel:
    def test_valid_entry(self):
        from agent_registry import AgentRegistryEntry

        entry = AgentRegistryEntry(
            arn="arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/SlackAI_TimeAgent",
            description="Time agent",
            skills=[{"id": "t1", "name": "Time"}],
        )
        assert entry.arn.startswith("arn:aws:")
        assert entry.description == "Time agent"
        assert len(entry.skills) == 1

    def test_entry_missing_arn(self):
        from pydantic import ValidationError
        from agent_registry import AgentRegistryEntry

        with pytest.raises(ValidationError):
            AgentRegistryEntry(description="desc", skills=[])

    def test_entry_missing_description(self):
        from pydantic import ValidationError
        from agent_registry import AgentRegistryEntry

        with pytest.raises(ValidationError):
            AgentRegistryEntry(arn="arn:aws:bedrock-agentcore:us-east-1:111:runtime/X", skills=[])

    def test_entry_empty_skills(self):
        from agent_registry import AgentRegistryEntry

        entry = AgentRegistryEntry(
            arn="arn:aws:bedrock-agentcore:us-east-1:111:runtime/X",
            description="desc",
            skills=[],
        )
        assert entry.skills == []

    def test_entry_default_skills(self):
        from agent_registry import AgentRegistryEntry

        entry = AgentRegistryEntry(
            arn="arn:aws:bedrock-agentcore:us-east-1:111:runtime/X",
            description="desc",
        )
        assert entry.skills == []


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _make_dynamo_item(
    agent_id: str,
    arn: str,
    description: str,
    skills: list | None = None,
    env: str = "dev",
) -> dict:
    """Build a DynamoDB item dict as returned by boto3.resource Table.query."""
    return {
        "env": env,
        "agent_id": agent_id,
        "arn": arn,
        "description": description,
        "skills": skills or [],
        "updated_at": "2026-03-25T10:00:00+09:00",
    }


def _make_dynamo_query_response(items: list[dict]) -> dict:
    """Build a mock DynamoDB Table.query response."""
    return {"Items": items, "Count": len(items)}


def _make_mock_table(query_response: dict) -> MagicMock:
    """Return a MagicMock DynamoDB Table whose query returns the given response."""
    mock_table = MagicMock()
    mock_table.query.return_value = query_response
    return mock_table


# ---------------------------------------------------------------------------
# _load_from_dynamodb — valid items
# ---------------------------------------------------------------------------
class TestLoadFromDynamoDBValid:
    def test_loads_multiple_agent_items(self):
        from agent_registry import _load_from_dynamodb

        items = [
            _make_dynamo_item("time", "arn:aws:bedrock-agentcore:us-east-1:111:runtime/Time", "Time agent"),
            _make_dynamo_item("docs", "arn:aws:bedrock-agentcore:us-east-1:111:runtime/Docs", "Docs agent"),
        ]
        mock_table = _make_mock_table(_make_dynamo_query_response(items))

        with patch("agent_registry.boto3") as mock_boto3:
            mock_boto3.resource.return_value.Table.return_value = mock_table
            arns, cards = _load_from_dynamodb("test-table", "dev")

        assert "time" in arns
        assert "docs" in arns
        assert arns["time"] == "arn:aws:bedrock-agentcore:us-east-1:111:runtime/Time"
        assert cards["time"]["description"] == "Time agent"
        assert cards["docs"]["description"] == "Docs agent"

    def test_agent_id_used_as_registry_key(self):
        from agent_registry import _load_from_dynamodb

        items = [
            _make_dynamo_item(
                "fetch-url",
                "arn:aws:bedrock-agentcore:us-east-1:111:runtime/FU",
                "Fetch URL",
            ),
        ]
        mock_table = _make_mock_table(_make_dynamo_query_response(items))

        with patch("agent_registry.boto3") as mock_boto3:
            mock_boto3.resource.return_value.Table.return_value = mock_table
            arns, cards = _load_from_dynamodb("test-table", "dev")

        assert "fetch-url" in arns


# ---------------------------------------------------------------------------
# _load_from_dynamodb — empty table (no items)
# ---------------------------------------------------------------------------
class TestLoadFromDynamoDBEmpty:
    def test_no_items_returns_empty(self):
        from agent_registry import _load_from_dynamodb

        mock_table = _make_mock_table(_make_dynamo_query_response([]))

        with patch("agent_registry.boto3") as mock_boto3:
            mock_boto3.resource.return_value.Table.return_value = mock_table
            arns, cards = _load_from_dynamodb("test-table", "dev")

        assert arns == {}
        assert cards == {}


# ---------------------------------------------------------------------------
# _load_from_dynamodb — mix of valid and invalid items
# ---------------------------------------------------------------------------
class TestLoadFromDynamoDBMixed:
    def test_valid_loaded_invalid_skipped(self):
        from agent_registry import _load_from_dynamodb

        items = [
            _make_dynamo_item("time", "arn:aws:bedrock-agentcore:us-east-1:111:runtime/Time", "Time agent"),
            # item missing required 'arn' field — should be skipped
            {"env": "dev", "agent_id": "bad", "description": "no arn", "skills": []},
        ]
        mock_table = _make_mock_table(_make_dynamo_query_response(items))

        with patch("agent_registry.boto3") as mock_boto3:
            mock_boto3.resource.return_value.Table.return_value = mock_table
            arns, cards = _load_from_dynamodb("test-table", "dev")

        assert "time" in arns
        assert "bad" not in arns

    def test_pydantic_validation_error_skipped(self):
        from agent_registry import _load_from_dynamodb

        items = [
            _make_dynamo_item("good", "arn:aws:bedrock-agentcore:us-east-1:111:runtime/Good", "Good agent"),
            # missing 'arn' → Pydantic ValidationError
            {"env": "dev", "agent_id": "missing-arn", "description": "missing arn", "skills": []},
        ]
        mock_table = _make_mock_table(_make_dynamo_query_response(items))

        with patch("agent_registry.boto3") as mock_boto3:
            mock_boto3.resource.return_value.Table.return_value = mock_table
            arns, cards = _load_from_dynamodb("test-table", "dev")

        assert "good" in arns
        assert "missing-arn" not in arns


# ---------------------------------------------------------------------------
# _load_from_dynamodb — Query exception (fail-open)
# ---------------------------------------------------------------------------
class TestLoadFromDynamoDBQueryException:
    def test_query_exception_returns_empty(self):
        from agent_registry import _load_from_dynamodb

        mock_table = MagicMock()
        mock_table.query.side_effect = Exception("DynamoDB service unavailable")

        with patch("agent_registry.boto3") as mock_boto3:
            mock_boto3.resource.return_value.Table.return_value = mock_table
            arns, cards = _load_from_dynamodb("test-table", "dev")

        assert arns == {}
        assert cards == {}


# ---------------------------------------------------------------------------
# _load_from_dynamodb — individual item processing failure
# ---------------------------------------------------------------------------
class TestLoadFromDynamoDBItemFailure:
    def test_one_invalid_item_others_loaded(self):
        from agent_registry import _load_from_dynamodb

        items = [
            _make_dynamo_item("time", "arn:aws:bedrock-agentcore:us-east-1:111:runtime/Time", "Time"),
            # invalid item — empty arn (rejected by empty-arn check)
            {"env": "dev", "agent_id": "broken", "arn": "", "description": "Bad", "skills": []},
            _make_dynamo_item("docs", "arn:aws:bedrock-agentcore:us-east-1:111:runtime/Docs", "Docs"),
        ]
        mock_table = _make_mock_table(_make_dynamo_query_response(items))

        with patch("agent_registry.boto3") as mock_boto3:
            mock_boto3.resource.return_value.Table.return_value = mock_table
            arns, cards = _load_from_dynamodb("test-table", "dev")

        assert "time" in arns
        assert "docs" in arns
        assert "broken" not in arns


# ---------------------------------------------------------------------------
# initialize_registry reads env vars and calls _load_from_dynamodb
# ---------------------------------------------------------------------------
class TestInitializeRegistry:
    def test_reads_env_and_loads(self):
        from agent_registry import initialize_registry, get_agent_arn, get_all_cards

        items = [
            _make_dynamo_item(
                "time",
                "arn:aws:bedrock-agentcore:us-east-1:111:runtime/Time",
                "Time agent",
            ),
        ]
        mock_table = _make_mock_table(_make_dynamo_query_response(items))

        with patch.dict(os.environ, {
            "AGENT_REGISTRY_TABLE": "my-table",
            "AGENT_REGISTRY_ENV": "dev",
        }, clear=True), patch("agent_registry.boto3") as mock_boto3:
            mock_boto3.resource.return_value.Table.return_value = mock_table
            initialize_registry()

        assert get_agent_arn("time") == "arn:aws:bedrock-agentcore:us-east-1:111:runtime/Time"
        cards = get_all_cards()
        assert cards["time"]["description"] == "Time agent"

    def test_populates_arns_and_cards(self):
        from agent_registry import initialize_registry, get_agent_arn, get_all_cards, get_agent_ids

        items = [
            _make_dynamo_item(
                "time",
                "arn:aws:bedrock-agentcore:us-east-1:111:runtime/Time",
                "Time",
                [{"id": "t1", "name": "Current Time"}],
            ),
            _make_dynamo_item(
                "docs",
                "arn:aws:bedrock-agentcore:us-east-1:111:runtime/Docs",
                "Docs",
            ),
        ]
        mock_table = _make_mock_table(_make_dynamo_query_response(items))

        with patch.dict(os.environ, {
            "AGENT_REGISTRY_TABLE": "my-table",
            "AGENT_REGISTRY_ENV": "dev",
        }, clear=True), patch("agent_registry.boto3") as mock_boto3:
            mock_boto3.resource.return_value.Table.return_value = mock_table
            initialize_registry()

        assert get_agent_arn("time").endswith("/Time")
        assert get_agent_arn("docs").endswith("/Docs")
        assert get_agent_arn("unknown") == ""
        assert sorted(get_agent_ids()) == ["docs", "time"]

        cards = get_all_cards()
        assert cards["time"]["skills"][0]["name"] == "Current Time"

    def test_missing_env_vars_empty_registry(self):
        from agent_registry import initialize_registry, get_agent_ids, get_all_cards

        with patch.dict(os.environ, {}, clear=True):
            initialize_registry()

        assert get_agent_ids() == []
        assert get_all_cards() == {}

    def test_get_all_cards_returns_dict(self):
        from agent_registry import initialize_registry, get_all_cards

        items = [
            _make_dynamo_item(
                "time",
                "arn:aws:bedrock-agentcore:us-east-1:111:runtime/T",
                "desc",
            ),
        ]
        mock_table = _make_mock_table(_make_dynamo_query_response(items))

        with patch.dict(os.environ, {
            "AGENT_REGISTRY_TABLE": "my-table",
            "AGENT_REGISTRY_ENV": "dev",
        }, clear=True), patch("agent_registry.boto3") as mock_boto3:
            mock_boto3.resource.return_value.Table.return_value = mock_table
            initialize_registry()

        cards = get_all_cards()
        assert isinstance(cards, dict)
        assert isinstance(cards["time"], dict)
        assert "arn" in cards["time"]
        assert "description" in cards["time"]
        assert "skills" in cards["time"]

    def test_get_agent_arn(self):
        from agent_registry import initialize_registry, get_agent_arn

        items = [
            _make_dynamo_item(
                "time",
                "arn:aws:bedrock-agentcore:us-east-1:111:runtime/T",
                "desc",
            ),
        ]
        mock_table = _make_mock_table(_make_dynamo_query_response(items))

        with patch.dict(os.environ, {
            "AGENT_REGISTRY_TABLE": "my-table",
            "AGENT_REGISTRY_ENV": "dev",
        }, clear=True), patch("agent_registry.boto3") as mock_boto3:
            mock_boto3.resource.return_value.Table.return_value = mock_table
            initialize_registry()

        assert get_agent_arn("time") == "arn:aws:bedrock-agentcore:us-east-1:111:runtime/T"
        assert get_agent_arn("nonexistent") == ""


# ---------------------------------------------------------------------------
# refresh_registry re-reads DynamoDB
# ---------------------------------------------------------------------------
class TestRefreshRegistry:
    def test_refresh_updates_registry(self):
        from agent_registry import initialize_registry, refresh_registry, get_agent_ids, get_all_cards

        items_init = [
            _make_dynamo_item("time", "arn:aws:bedrock-agentcore:us-east-1:111:runtime/Time", "Time"),
        ]
        items_refresh = [
            _make_dynamo_item("time", "arn:aws:bedrock-agentcore:us-east-1:111:runtime/Time", "Time"),
            _make_dynamo_item("docs", "arn:aws:bedrock-agentcore:us-east-1:111:runtime/Docs", "Docs"),
        ]
        mock_table = MagicMock()
        mock_table.query.side_effect = [
            _make_dynamo_query_response(items_init),
            _make_dynamo_query_response(items_refresh),
        ]

        with patch.dict(os.environ, {
            "AGENT_REGISTRY_TABLE": "my-table",
            "AGENT_REGISTRY_ENV": "dev",
        }, clear=True), patch("agent_registry.boto3") as mock_boto3:
            mock_boto3.resource.return_value.Table.return_value = mock_table
            initialize_registry()
            assert get_agent_ids() == ["time"]

            refresh_registry()
            assert sorted(get_agent_ids()) == ["docs", "time"]

    def test_new_agent_appears_after_refresh(self):
        from agent_registry import initialize_registry, refresh_registry, get_agent_ids

        items_init = [
            _make_dynamo_item("time", "arn:t", "T"),
        ]
        items_refresh = [
            _make_dynamo_item("time", "arn:t", "T"),
            _make_dynamo_item("new-agent", "arn:n", "New"),
        ]
        mock_table = MagicMock()
        mock_table.query.side_effect = [
            _make_dynamo_query_response(items_init),
            _make_dynamo_query_response(items_refresh),
        ]

        with patch.dict(os.environ, {
            "AGENT_REGISTRY_TABLE": "my-table",
            "AGENT_REGISTRY_ENV": "dev",
        }, clear=True), patch("agent_registry.boto3") as mock_boto3:
            mock_boto3.resource.return_value.Table.return_value = mock_table
            initialize_registry()
            assert "new-agent" not in get_agent_ids()

            refresh_registry()
            assert "new-agent" in get_agent_ids()

    def test_removed_agent_absent_after_refresh(self):
        from agent_registry import initialize_registry, refresh_registry, get_agent_ids

        items_init = [
            _make_dynamo_item("time", "arn:t", "T"),
            _make_dynamo_item("docs", "arn:d", "D"),
        ]
        items_refresh = [
            _make_dynamo_item("time", "arn:t", "T"),
            # docs removed
        ]
        mock_table = MagicMock()
        mock_table.query.side_effect = [
            _make_dynamo_query_response(items_init),
            _make_dynamo_query_response(items_refresh),
        ]

        with patch.dict(os.environ, {
            "AGENT_REGISTRY_TABLE": "my-table",
            "AGENT_REGISTRY_ENV": "dev",
        }, clear=True), patch("agent_registry.boto3") as mock_boto3:
            mock_boto3.resource.return_value.Table.return_value = mock_table
            initialize_registry()
            assert "docs" in get_agent_ids()

            refresh_registry()
            assert "docs" not in get_agent_ids()


# ---------------------------------------------------------------------------
# SlackSearch loaded same as other agents
# ---------------------------------------------------------------------------
class TestSlackSearchRegistry:
    def test_slack_search_loaded_like_other_agents(self):
        from agent_registry import initialize_registry, get_agent_arn, get_all_cards

        items = [
            _make_dynamo_item("time", "arn:aws:bedrock-agentcore:us-east-1:111:runtime/Time", "Time"),
            _make_dynamo_item(
                "slack-search",
                "arn:aws:bedrock-agentcore:us-east-1:111:runtime/SlackSearch",
                "Slack Search",
                [{"id": "search", "name": "Search Slack"}],
            ),
        ]
        mock_table = _make_mock_table(_make_dynamo_query_response(items))

        with patch.dict(os.environ, {
            "AGENT_REGISTRY_TABLE": "my-table",
            "AGENT_REGISTRY_ENV": "dev",
        }, clear=True), patch("agent_registry.boto3") as mock_boto3:
            mock_boto3.resource.return_value.Table.return_value = mock_table
            initialize_registry()

        assert get_agent_arn("slack-search").endswith("/SlackSearch")
        cards = get_all_cards()
        assert "slack-search" in cards
        assert cards["slack-search"]["description"] == "Slack Search"
