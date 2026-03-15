"""Unit tests for Slack Search Agent agent_card.py — TDD (RED phase)."""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../src"))

from agent_card import get_agent_card, get_health_status


def test_agent_card_name() -> None:
    card = get_agent_card()
    assert card["name"] == "SlackAI-SlackSearchAgent"


def test_agent_card_protocol() -> None:
    card = get_agent_card()
    assert card["protocol"] == "A2A"
    assert card["protocolVersion"] == "1.0"


def test_agent_card_has_three_skills() -> None:
    card = get_agent_card()
    skill_ids = {s["id"] for s in card.get("skills", [])}
    assert "search-messages" in skill_ids
    assert "get-thread" in skill_ids
    assert "get-channel-history" in skill_ids
    assert len(card["skills"]) == 3


def test_agent_card_authentication_sigv4() -> None:
    card = get_agent_card()
    auth = card.get("authentication", {})
    assert auth.get("type") == "SIGV4"
    assert auth.get("service") == "bedrock-agentcore"


def test_agent_card_capabilities() -> None:
    card = get_agent_card()
    caps = card["capabilities"]
    assert caps["streaming"] is False
    assert caps["asyncProcessing"] is False
    assert caps["attachments"] is False


def test_agent_card_is_json_serializable() -> None:
    card = get_agent_card()
    serialized = json.dumps(card)
    assert "SlackAI-SlackSearchAgent" in serialized


def test_health_status_healthy() -> None:
    status = get_health_status(is_busy=False)
    assert status["status"] == "Healthy"
    assert status["agent"] == "SlackAI-SlackSearchAgent"


def test_health_status_busy() -> None:
    status = get_health_status(is_busy=True)
    assert status["status"] == "HealthyBusy"
