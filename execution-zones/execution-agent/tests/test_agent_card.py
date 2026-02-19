"""
Unit tests for Execution Agent agent_card.py (A2A Agent Discovery).

Tests:
- Agent Card structure and required fields
- Skill definitions
- Authentication configuration
- Health status endpoint
- Protocol compliance
"""

import json
import os
import sys

import pytest

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agent_card import get_agent_card, get_health_status


class TestExecutionAgentCardStructure:
    """Test Agent Card has all A2A-required fields."""

    def test_has_name(self):
        card = get_agent_card()
        assert "name" in card
        assert card["name"] == "SlackAI-FileCreatorAgent"

    def test_has_protocol_a2a(self):
        card = get_agent_card()
        assert card["protocol"] == "A2A"

    def test_has_protocol_version(self):
        card = get_agent_card()
        assert card["protocolVersion"] == "1.0"

    def test_has_description(self):
        card = get_agent_card()
        assert "description" in card
        assert len(card["description"]) > 10

    def test_has_url(self):
        card = get_agent_card()
        assert "url" in card

    def test_has_capabilities(self):
        card = get_agent_card()
        assert "capabilities" in card
        caps = card["capabilities"]
        assert "asyncProcessing" in caps
        assert caps["asyncProcessing"] is True

    def test_has_authentication(self):
        card = get_agent_card()
        assert "authentication" in card
        assert card["authentication"]["type"] == "SIGV4"

    def test_card_is_json_serializable(self):
        card = get_agent_card()
        serialized = json.dumps(card)
        deserialized = json.loads(serialized)
        assert deserialized["name"] == "SlackAI-FileCreatorAgent"


class TestExecutionAgentCardSkills:
    """Test skill definitions in Agent Card."""

    def test_has_generate_excel_skill(self):
        card = get_agent_card()
        skill_ids = [s["id"] for s in card["skills"]]
        assert "generate_excel" in skill_ids

    def test_has_generate_word_skill(self):
        card = get_agent_card()
        skill_ids = [s["id"] for s in card["skills"]]
        assert "generate_word" in skill_ids

    def test_has_fetch_url_skill(self):
        card = get_agent_card()
        skill_ids = [s["id"] for s in card["skills"]]
        assert "fetch_url" in skill_ids

    def test_skills_have_required_fields(self):
        card = get_agent_card()
        for skill in card["skills"]:
            assert "id" in skill, f"Skill missing 'id': {skill}"
            assert "name" in skill, f"Skill missing 'name': {skill}"
            assert "description" in skill, f"Skill missing 'description': {skill}"


class TestExecutionAgentHealthStatus:
    """Test health status endpoint responses."""

    def test_healthy_when_not_busy(self):
        status = get_health_status(is_busy=False)
        assert status["status"] == "Healthy"

    def test_healthy_busy_when_processing(self):
        status = get_health_status(is_busy=True)
        assert status["status"] == "HealthyBusy"

    def test_health_includes_agent_name(self):
        status = get_health_status(is_busy=False)
        assert status["agent"] == "SlackAI-FileCreatorAgent"

    def test_health_is_json_serializable(self):
        status = get_health_status(is_busy=False)
        serialized = json.dumps(status)
        assert "Healthy" in serialized

    def test_health_includes_timestamp(self):
        status = get_health_status(is_busy=False)
        assert "timestamp" in status
