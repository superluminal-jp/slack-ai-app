"""
get_current_time tool for Execution Agent.

Returns the current date and time so the model can answer time-based questions
(e.g. "今何時？", "今日の日付", "タイムスタンプ"). Default timezone is JST (Asia/Tokyo).
"""

import os
from datetime import datetime, timezone

from strands import tool

DEFAULT_TZ = "Asia/Tokyo"  # JST


def _now_utc() -> datetime:
    """Current time in UTC (container default)."""
    return datetime.now(timezone.utc)


@tool
def get_current_time() -> str:
    """現在の日時を返します（JST / 日本標準時）。

    ユーザーが「今何時？」「今日の日付は？」「現在時刻」などと聞いた場合にこのツールを呼び出し、
    返された日時を元に回答してください。デフォルトは JST（Asia/Tokyo）です（TZ 環境変数で上書き可能）。

    Returns:
        現在日時の読みやすい形式（JST）と、ISO8601 形式（JST および UTC）。
    """
    tz_name = os.environ.get("TZ", DEFAULT_TZ)
    try:
        if tz_name and tz_name.upper() != "UTC":
            import zoneinfo
            dt = datetime.now(zoneinfo.ZoneInfo(tz_name))
        else:
            dt = _now_utc()
            tz_name = "UTC"
    except Exception:
        import zoneinfo
        dt = datetime.now(zoneinfo.ZoneInfo(DEFAULT_TZ))
        tz_name = DEFAULT_TZ
    readable = dt.strftime("%Y年%m月%d日 %H:%M:%S") + f" ({tz_name})"
    iso_jst = dt.isoformat()
    iso_utc = dt.astimezone(timezone.utc).isoformat()
    return f"現在日時: {readable}\nISO8601(JST): {iso_jst}\nISO8601(UTC): {iso_utc}"
