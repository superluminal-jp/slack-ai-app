"""Unit tests for agent_registry.py."""

import json
import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestAgentRegistry:
    @patch("agent_registry.discover_agent_card")
    def test_multi_agent_from_execution_agent_arns_json(self, mock_discover):
        """When EXECUTION_AGENT_ARNS JSON is set, registry should expose all configured agents."""
        mock_discover.side_effect = [
            {"name": "SlackAI-FileCreatorAgent"},
            {"name": "SlackAI-DocsAgent"},
            {"name": "SlackAI-TimeAgent"},
        ]
        arns = {
            "file-creator": "arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/file-creator",
            "docs": "arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/docs",
            "time": "arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/time",
        }

        with patch.dict(
            os.environ,
            {
                "EXECUTION_AGENT_ARNS": json.dumps(arns),
                "ENABLE_AGENT_CARD_DISCOVERY": "true",
            },
            clear=True,
        ):
            from agent_registry import initialize_registry, get_agent_arn, is_multi_agent, get_all_cards

            initialize_registry()

            assert get_agent_arn("file-creator").endswith("/file-creator")
            assert get_agent_arn("docs").endswith("/docs")
            assert get_agent_arn("time").endswith("/time")
            assert get_agent_arn("unknown") == ""
            assert is_multi_agent() is True
            cards = get_all_cards()
            assert cards.get("docs", {}).get("name") == "SlackAI-DocsAgent"

    @patch("agent_registry.discover_agent_card")
    def test_refresh_missing_cards_retries_none_cards(self, mock_discover):
        """refresh_missing_cards should re-attempt discovery for None cards only."""
        mock_discover.side_effect = [
            None,  # file-creator fails at init
            {"name": "SlackAI-DocsAgent"},  # docs succeeds at init
            None,  # time fails at init
            {"name": "SlackAI-FileCreatorAgent"},  # file-creator succeeds at refresh
            {"name": "SlackAI-TimeAgent"},  # time succeeds at refresh
        ]
        arns = {
            "file-creator": "arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/file-creator",
            "docs": "arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/docs",
            "time": "arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/time",
        }

        with patch.dict(
            os.environ,
            {
                "EXECUTION_AGENT_ARNS": json.dumps(arns),
                "ENABLE_AGENT_CARD_DISCOVERY": "true",
            },
            clear=True,
        ):
            from agent_registry import initialize_registry, get_all_cards, refresh_missing_cards

            initialize_registry()
            cards_before = get_all_cards()
            assert cards_before["file-creator"] is None
            assert cards_before["docs"] is not None
            assert cards_before["time"] is None

            result = refresh_missing_cards()
            assert result is True

            cards_after = get_all_cards()
            assert cards_after["file-creator"]["name"] == "SlackAI-FileCreatorAgent"
            assert cards_after["docs"]["name"] == "SlackAI-DocsAgent"  # unchanged
            assert cards_after["time"]["name"] == "SlackAI-TimeAgent"

    @patch("agent_registry.discover_agent_card")
    def test_refresh_missing_cards_skips_when_all_present(self, mock_discover):
        """refresh_missing_cards should not call discover if all cards are present."""
        mock_discover.return_value = {"name": "SlackAI-FileCreatorAgent"}
        arns = {
            "file-creator": "arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/file-creator",
        }

        with patch.dict(
            os.environ,
            {
                "EXECUTION_AGENT_ARNS": json.dumps(arns),
                "ENABLE_AGENT_CARD_DISCOVERY": "true",
            },
            clear=True,
        ):
            from agent_registry import initialize_registry, refresh_missing_cards

            initialize_registry()
            assert mock_discover.call_count == 1

            result = refresh_missing_cards()
            assert result is False
            assert mock_discover.call_count == 1  # no additional calls

    @patch("agent_registry.discover_agent_card")
    def test_refresh_missing_cards_noop_when_discovery_disabled(self, mock_discover):
        """refresh_missing_cards should do nothing when discovery is disabled."""
        arns = {
            "file-creator": "arn:aws:bedrock-agentcore:ap-northeast-1:111111111111:runtime/file-creator",
        }

        with patch.dict(
            os.environ,
            {
                "EXECUTION_AGENT_ARNS": json.dumps(arns),
                "ENABLE_AGENT_CARD_DISCOVERY": "false",
            },
            clear=True,
        ):
            from agent_registry import initialize_registry, refresh_missing_cards

            initialize_registry()
            result = refresh_missing_cards()
            assert result is False

    @patch("agent_registry.discover_agent_card")
    def test_invalid_execution_agent_arns_json_results_empty_registry(self, mock_discover):
        """Invalid EXECUTION_AGENT_ARNS JSON should not configure any agent."""
        mock_discover.return_value = None

        with patch.dict(
            os.environ,
            {
                "EXECUTION_AGENT_ARNS": "{invalid-json",
                "ENABLE_AGENT_CARD_DISCOVERY": "true",
            },
            clear=True,
        ):
            from agent_registry import initialize_registry, get_agent_arn, is_multi_agent, get_agent_ids

            initialize_registry()
            assert get_agent_arn("file-creator") == ""
            assert get_agent_ids() == []
            assert is_multi_agent() is False
