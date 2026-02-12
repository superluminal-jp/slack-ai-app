"""
Structured JSON logging for Verification Agent (CloudWatch).

Outputs one JSON object per line to stdout for CloudWatch Logs Insights.
Configure on first import.
"""

import json
import logging
import sys
import time
from typing import Any

LOGGER_NAME = "verification-agent"


class _StdoutHandler(logging.StreamHandler):
    """StreamHandler that uses current sys.stdout at emit time (for pytest capsys capture)."""

    def __init__(self) -> None:
        super().__init__(sys.stdout)

    def emit(self, record: logging.LogRecord) -> None:
        self.stream = sys.stdout
        super().emit(record)


def _setup() -> None:
    """Configure logger to output JSON to stdout (message only)."""
    logger = logging.getLogger(LOGGER_NAME)
    if logger.handlers:
        return
    logger.setLevel(logging.INFO)
    logger.propagate = False
    handler = _StdoutHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)


_setup()


def get_logger() -> logging.Logger:
    """Return the configured Verification Agent logger."""
    return logging.getLogger(LOGGER_NAME)


def log(
    logger: logging.Logger,
    level: str,
    event_type: str,
    data: dict,
    *,
    service: str = "verification-agent",
) -> None:
    """Log structured JSON for CloudWatch."""
    log_entry: dict[str, Any] = {
        "level": level,
        "event_type": event_type,
        "service": service,
        "timestamp": time.time(),
        **data,
    }
    msg = json.dumps(log_entry, default=str, ensure_ascii=False)
    log_method = logger.warning if level.upper() == "WARN" else getattr(logger, level.lower(), logger.info)
    log_method(msg)
