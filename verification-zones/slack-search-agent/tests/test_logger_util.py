import json
import logging
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from logger_util import get_logger, log


class _CaptureHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


def test_logger_propagates_to_root_logger() -> None:
    assert get_logger().propagate is True


def test_log_writes_json_to_stdout(capsys) -> None:
    logger = get_logger()
    log(logger, "info", "test.stdout", {"correlation_id": "corr-stdout"})
    out = capsys.readouterr().out
    assert '"event_type": "test.stdout"' in out


def test_root_logger_handler_receives_record() -> None:
    root_logger = logging.getLogger()
    capture_handler = _CaptureHandler()
    root_logger.addHandler(capture_handler)
    try:
        logger = get_logger()
        log(logger, "info", "test.root", {"correlation_id": "corr-root"})
        assert any(
            json.loads(record.getMessage()).get("event_type") == "test.root"
            for record in capture_handler.records
        )
    finally:
        root_logger.removeHandler(capture_handler)


def test_no_duplicate_stdout_emission(capsys) -> None:
    logger = get_logger()
    log(logger, "info", "test.once", {"correlation_id": "corr-once"})
    lines = [line for line in capsys.readouterr().out.splitlines() if line.strip()]
    matching = [line for line in lines if '"event_type": "test.once"' in line]
    assert len(matching) == 1
