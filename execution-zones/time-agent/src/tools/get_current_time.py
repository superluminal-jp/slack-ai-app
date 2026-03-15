"""
get_current_time tool for Time Agent.

Returns the current date and time. Default timezone is JST (Asia/Tokyo).
"""

import os
from datetime import datetime, timezone

from strands import tool

DEFAULT_TZ = "Asia/Tokyo"


def _now_utc() -> datetime:
    """Current time in UTC."""
    return datetime.now(timezone.utc)


@tool
def get_current_time() -> str:
    """現在の日時を返します（既定: JST）。"""
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
    iso_local = dt.isoformat()
    iso_utc = dt.astimezone(timezone.utc).isoformat()
    return f"現在日時: {readable}\\nISO8601(Local): {iso_local}\\nISO8601(UTC): {iso_utc}"
