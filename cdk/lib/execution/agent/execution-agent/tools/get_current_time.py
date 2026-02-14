"""
get_current_time tool for Execution Agent.

Returns the current date and time so the model can answer time-based questions
(e.g. "今何時？", "今日の日付", "タイムスタンプ").
"""

import os
from datetime import datetime, timezone

from strands import tool


def _now_utc() -> datetime:
    """Current time in UTC (container default)."""
    return datetime.now(timezone.utc)


@tool
def get_current_time() -> str:
    """現在の日時を返します。

    ユーザーが「今何時？」「今日の日付は？」「現在時刻」などと聞いた場合にこのツールを呼び出し、
    返された日時を元に回答してください。タイムゾーンは UTC です（TZ 環境変数で上書き可能）。

    Returns:
        現在日時の ISO 形式文字列（UTC）と、読みやすい形式の文字列。
    """
    tz_name = os.environ.get("TZ", "UTC")
    try:
        if tz_name and tz_name != "UTC":
            import zoneinfo
            dt = datetime.now(zoneinfo.ZoneInfo(tz_name))
        else:
            dt = _now_utc()
    except Exception:
        dt = _now_utc()
        tz_name = "UTC"
    iso = dt.isoformat()
    readable = dt.strftime("%Y年%m月%d日 %H:%M:%S") + f" ({tz_name})"
    return f"現在日時: {readable}\nISO8601(UTC): {dt.astimezone(timezone.utc).isoformat()}"
