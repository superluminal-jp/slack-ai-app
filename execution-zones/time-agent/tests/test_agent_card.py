"""Unit tests for Time Agent agent_card.py."""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agent_card import get_agent_card, get_health_status


def test_agent_card_name_and_protocol() -> None:
    card = get_agent_card()
    assert card["name"] == "SlackAI-TimeAgent"
    assert card["protocol"] == "A2A"
    assert card["protocolVersion"] == "1.0"


def test_agent_card_current_time_skill() -> None:
    card = get_agent_card()
    skills = {s["id"] for s in card.get("skills", [])}
    assert "current-time" in skills


def test_agent_capabilities_time_only() -> None:
    card = get_agent_card()
    caps = card["capabilities"]
    assert caps["attachments"] is False
    assert caps["asyncProcessing"] is False


def test_health_status() -> None:
    assert get_health_status(is_busy=False)["status"] == "Healthy"
    assert get_health_status(is_busy=True)["status"] == "HealthyBusy"


def test_card_is_json_serializable() -> None:
    card = get_agent_card()
    serialized = json.dumps(card)
    assert "SlackAI-TimeAgent" in serialized
