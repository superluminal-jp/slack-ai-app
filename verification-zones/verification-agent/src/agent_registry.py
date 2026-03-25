"""Execution agent registry for multi-agent routing.

Reads all agent entries from a DynamoDB table at startup via a single Query
on PK=env. Each item contains an agent's ARN, description, and skills.
"""

import os
import time
from typing import Any, Dict, Optional

import boto3
from boto3.dynamodb.conditions import Key
from pydantic import BaseModel

from logger_util import get_logger, log

_logger = get_logger()
DEFAULT_AGENT_ID = "file-creator"

_AGENT_ARNS: Dict[str, str] = {}
_AGENT_CARDS: Dict[str, Optional[dict]] = {}
_LAST_REFRESH_UNIX_S: float = 0.0


class AgentSkill(BaseModel):
    id: str
    name: str
    description: str = ""


class AgentRegistryEntry(BaseModel):
    arn: str
    description: str
    skills: list[AgentSkill] = []
    api: Dict[str, Any] = {}


def _log(level: str, event_type: str, data: dict) -> None:
    """Structured JSON logging for CloudWatch."""
    log(_logger, level, event_type, data, service="verification-agent-registry")


def _load_from_dynamodb(
    table_name: str, env: str
) -> tuple[Dict[str, str], Dict[str, Optional[dict]]]:
    """Load all agent entries from DynamoDB via a single Query on PK=env.

    Returns (arns, cards) where arns maps agent-id to ARN string
    and cards maps agent-id to the full entry dict.
    """
    arns: Dict[str, str] = {}
    cards: Dict[str, Optional[dict]] = {}

    try:
        # AgentCore runtimes may not set a default boto3 region consistently.
        # DynamoDB is regional; explicitly pin to the app region to avoid
        # accidentally querying a same-named table in a different region.
        region_name = (
            os.environ.get("AWS_REGION_NAME")
            or os.environ.get("AWS_REGION")
            or "ap-northeast-1"
        )
        table = boto3.resource("dynamodb", region_name=region_name).Table(table_name)
        response = table.query(KeyConditionExpression=Key("env").eq(env))
    except Exception as e:
        _log("warning", "dynamodb_query_failed", {
            "dynamodb_region": region_name if "region_name" in locals() else None,
            "table": table_name,
            "env": env,
            "error": str(e),
            "error_type": type(e).__name__,
        })
        return arns, cards

    items = response.get("Items", [])
    if not items:
        _log("info", "dynamodb_query_empty", {
            "dynamodb_region": region_name,
            "table": table_name,
            "env": env,
        })
        return arns, cards

    for item in items:
        agent_id = item.get("agent_id", "")
        if not agent_id:
            continue

        try:
            # Convert skills from DynamoDB list-of-map to Pydantic-compatible format
            skills_raw = item.get("skills", [])
            entry = AgentRegistryEntry(
                arn=item.get("arn", ""),
                description=item.get("description", ""),
                skills=skills_raw,
                api=item.get("api", {}) if isinstance(item.get("api", {}), dict) else {},
            )
        except Exception as e:
            _log("error", "agent_card_parse_failed", {
                "table": table_name,
                "agent_id": agent_id,
                "error": str(e),
                "error_type": type(e).__name__,
            })
            continue

        if not entry.arn:
            _log("warning", "agent_card_missing_arn", {
                "table": table_name,
                "agent_id": agent_id,
            })
            continue

        arns[agent_id] = entry.arn
        cards[agent_id] = entry.model_dump()

    return arns, cards


def initialize_registry() -> None:
    """Initialize registry by querying all agent entries from DynamoDB."""
    global _AGENT_ARNS, _AGENT_CARDS

    table_name = os.environ.get("AGENT_REGISTRY_TABLE", "").strip()
    env = os.environ.get("AGENT_REGISTRY_ENV", "").strip()

    if not table_name or not env:
        _AGENT_ARNS = {}
        _AGENT_CARDS = {}
        _log("warning", "agent_registry_env_missing", {
            "message": "AGENT_REGISTRY_TABLE or AGENT_REGISTRY_ENV not set",
        })
        return

    _AGENT_ARNS, _AGENT_CARDS = _load_from_dynamodb(table_name, env)

    _log("info", "agent_registry_initialized", {
        "agent_ids": sorted(_AGENT_ARNS.keys()),
        "agent_count": len(_AGENT_ARNS),
        "multi_agent": len(_AGENT_ARNS) > 1,
        "source": "dynamodb",
        "table": table_name,
        "env": env,
    })


def refresh_registry() -> None:
    """Re-query all agent entries from DynamoDB and replace registry state."""
    global _AGENT_ARNS, _AGENT_CARDS

    table_name = os.environ.get("AGENT_REGISTRY_TABLE", "").strip()
    env = os.environ.get("AGENT_REGISTRY_ENV", "").strip()

    if not table_name or not env:
        return

    _AGENT_ARNS, _AGENT_CARDS = _load_from_dynamodb(table_name, env)
    global _LAST_REFRESH_UNIX_S
    _LAST_REFRESH_UNIX_S = time.time()

    _log("info", "agent_registry_refreshed", {
        "agent_ids": sorted(_AGENT_ARNS.keys()),
        "agent_count": len(_AGENT_ARNS),
    })


def refresh_registry_if_stale(max_age_seconds: int = 60) -> bool:
    """Refresh registry if the last refresh is older than max_age_seconds.

    Purpose:
      Keep the in-memory registry consistent with DynamoDB even when the runtime
      stays warm across deployments.

    Parameters:
      max_age_seconds: Minimum seconds between refreshes (>= 1 recommended).

    Returns:
      True when a refresh was attempted (success or fail-open), False otherwise.

    Side effects:
      May call DynamoDB Query and update the module-level caches.

    Error handling:
      Fail-open: any exception is logged and returns True (attempted) while
      keeping the previous cache.
    """
    if not isinstance(max_age_seconds, int) or max_age_seconds < 1:
        max_age_seconds = 60

    now = time.time()
    age = now - _LAST_REFRESH_UNIX_S
    if _LAST_REFRESH_UNIX_S > 0 and age < max_age_seconds:
        return False

    try:
        refresh_registry()
    except Exception as e:
        _log("warning", "agent_registry_refresh_failed", {
            "error": str(e),
            "error_type": type(e).__name__,
        })
    return True


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
