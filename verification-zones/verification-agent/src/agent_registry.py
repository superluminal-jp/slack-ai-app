"""Execution agent registry for multi-agent routing."""

import json
import os
from typing import Dict, Optional

from a2a_client import discover_agent_card
from logger_util import get_logger, log

_logger = get_logger()
DEFAULT_AGENT_ID = "file-creator"

_AGENT_ARNS: Dict[str, str] = {}
_AGENT_CARDS: Dict[str, Optional[dict]] = {}


def _log(level: str, event_type: str, data: dict) -> None:
    """Structured JSON logging for CloudWatch."""
    log(_logger, level, event_type, data, service="verification-agent-registry")


def _load_agent_arns() -> Dict[str, str]:
    """Load agent-id to runtime-arn mapping from environment variables."""
    raw_map = os.environ.get("EXECUTION_AGENT_ARNS", "").strip()
    if raw_map:
        try:
            parsed = json.loads(raw_map)
            if isinstance(parsed, dict):
                cleaned: Dict[str, str] = {}
                for key, value in parsed.items():
                    agent_id = str(key).strip()
                    arn = value.strip() if isinstance(value, str) else ""
                    if agent_id and arn:
                        cleaned[agent_id] = arn
                if cleaned:
                    return cleaned
        except (json.JSONDecodeError, TypeError, ValueError) as e:
            _log("WARN", "agent_registry_parse_failed", {"error": str(e)})

    return {}


def initialize_registry() -> None:
    """Initialize registry from env and discover agent cards for each target runtime."""
    global _AGENT_ARNS, _AGENT_CARDS

    _AGENT_ARNS = _load_agent_arns()
    _AGENT_CARDS = {}

    if not _AGENT_ARNS:
        _log("WARN", "agent_registry_empty", {"message": "No execution agent ARN configured"})
        return

    discovery_enabled = os.environ.get("ENABLE_AGENT_CARD_DISCOVERY", "false").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    if not discovery_enabled:
        for agent_id in _AGENT_ARNS.keys():
            _AGENT_CARDS[agent_id] = None
        _log("INFO", "agent_registry_initialized_without_discovery", {
            "agent_ids": sorted(_AGENT_ARNS.keys()),
            "agent_count": len(_AGENT_ARNS),
            "multi_agent": len(_AGENT_ARNS) > 1,
        })
        return

    for agent_id, arn in _AGENT_ARNS.items():
        try:
            _AGENT_CARDS[agent_id] = discover_agent_card(arn)
        except Exception as e:
            _AGENT_CARDS[agent_id] = None
            _log("WARN", "agent_card_discovery_failed", {
                "agent_id": agent_id,
                "arn": arn,
                "error": str(e),
            })

    _log("INFO", "agent_registry_initialized", {
        "agent_ids": sorted(_AGENT_ARNS.keys()),
        "agent_count": len(_AGENT_ARNS),
        "multi_agent": len(_AGENT_ARNS) > 1,
    })


def refresh_missing_cards() -> bool:
    """Re-attempt agent card discovery for entries that are still None.

    Returns True if at least one new card was discovered.
    """
    discovery_enabled = os.environ.get("ENABLE_AGENT_CARD_DISCOVERY", "false").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    if not discovery_enabled:
        return False

    refreshed = False
    for agent_id, card in list(_AGENT_CARDS.items()):
        if card is not None:
            continue
        arn = _AGENT_ARNS.get(agent_id, "")
        if not arn:
            continue
        try:
            result = discover_agent_card(arn)
            if result is not None:
                _AGENT_CARDS[agent_id] = result
                refreshed = True
                _log("INFO", "agent_card_lazy_discovery_success", {
                    "agent_id": agent_id,
                })
        except Exception as e:
            _log("WARN", "agent_card_lazy_discovery_failed", {
                "agent_id": agent_id,
                "error": str(e),
            })

    return refreshed


def get_agent_arn(agent_id: str) -> str:
    """Return runtime ARN for the given agent id; empty string when missing."""
    if agent_id in _AGENT_ARNS:
        return _AGENT_ARNS[agent_id]

    return ""


def is_multi_agent() -> bool:
    """True when more than one execution agent is configured."""
    return len(_AGENT_ARNS) > 1


def get_all_cards() -> Dict[str, Optional[dict]]:
    """Return discovered cards keyed by agent id."""
    return dict(_AGENT_CARDS)


def get_agent_ids() -> list[str]:
    """Return configured agent ids."""
    if _AGENT_ARNS:
        return sorted(_AGENT_ARNS.keys())
    return []
