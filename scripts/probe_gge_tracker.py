#!/usr/bin/env python3
"""Read-only compatibility probe for the public GGE Tracker dungeon API.

Tests whether the API serves production E4K_PL1 (and, for comparison only,
E4K_PL1_BETA). Output is safe for public CI artifacts: no player values,
attack timestamps, cooldown values, raw response bodies or dynamic keys.
"""
import json
import sys
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from urllib.parse import urlencode

BASE = "https://api.gge-tracker.com/api/v1/dungeons"
PARAMS = {"page": 1, "size": 3, "filterByKid": "[1]"}
PLAYER_FIELDS = {
    "player_id", "player_name", "player_might", "player_level",
    "player_legendary_level",
}
ATTACK_FIELDS = {
    "total_attack_count", "available_duration_seconds",
    "global_available_at", "effective_cooldown_until", "last_attack",
}


def _safe_integer(value):
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def summarize_payload(payload):
    """Keep only structural metadata and map coordinates; never serialize row values."""
    if not isinstance(payload, dict):
        return {
            "response_type": type(payload).__name__,
            "dungeon_count_in_sample": None,
            "sample_coordinates": [],
            "pagination": None,
            "player_metadata_present": False,
            "attack_metadata_present": False,
        }

    rows = payload.get("dungeons")
    rows = rows if isinstance(rows, list) else None
    coordinates = []
    player_metadata_present = False
    attack_metadata_present = False

    for row in (rows or [])[:3]:
        if not isinstance(row, dict):
            continue
        x = row.get("position_x", row.get("x"))
        y = row.get("position_y", row.get("y"))
        if (
            isinstance(x, int) and not isinstance(x, bool)
            and isinstance(y, int) and not isinstance(y, bool)
            and x >= 0 and y >= 0
        ):
            coordinates.append({"x": x, "y": y})
        keys = set(row.keys())
        player_metadata_present = player_metadata_present or bool(keys & PLAYER_FIELDS)
        attack_metadata_present = attack_metadata_present or bool(keys & ATTACK_FIELDS)

    pagination = payload.get("pagination")
    safe_pagination = None
    if isinstance(pagination, dict):
        candidate = {
            key: pagination.get(key)
            for key in ("current_page", "total_pages", "current_items_count", "total_items_count")
        }
        if all(_safe_integer(value) for value in candidate.values()):
            safe_pagination = candidate

    return {
        "response_type": "object",
        "dungeon_count_in_sample": len(rows) if rows is not None else None,
        "sample_coordinates": coordinates[:3],
        "pagination": safe_pagination,
        "player_metadata_present": player_metadata_present,
        "attack_metadata_present": attack_metadata_present,
    }


def probe(server):
    url = BASE + "?" + urlencode(PARAMS)
    request = Request(url, headers={
        "gge-server": server,
        "Accept": "application/json",
        "User-Agent": "Empirenew-readonly-provider-probe/1.1",
    })
    try:
        with urlopen(request, timeout=20) as response:
            body = response.read().decode("utf-8", "replace")
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                return {
                    "server": server,
                    "http_status": response.status,
                    "error_type": "invalid_json",
                    "ok": False,
                    **summarize_payload(None),
                }
            rows = payload.get("dungeons", []) if isinstance(payload, dict) else []
            return {
                "server": server,
                "http_status": response.status,
                "return_code": payload.get("return_code") if isinstance(payload, dict) else None,
                **summarize_payload(payload),
                "ok": response.status == 200 and isinstance(rows, list),
            }
    except HTTPError as error:
        # Do not read or emit the body: upstream errors may include account/player data.
        return {
            "server": server,
            "http_status": error.code,
            "error_type": "http_error",
            "ok": False,
        }
    except (URLError, TimeoutError) as error:
        return {
            "server": server,
            "error_type": type(error).__name__,
            "ok": False,
        }


def main():
    report = {
        "tested_at": datetime.now(timezone.utc).isoformat(),
        "endpoint": BASE,
        "query": PARAMS,
        "results": [probe("E4K_PL1"), probe("E4K_PL1_BETA")],
        "production_supported": False,
        "snapshot_written": False,
    }
    prod = report["results"][0]
    report["production_supported"] = bool(
        prod.get("ok") and prod.get("dungeon_count_in_sample", 0) > 0
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["production_supported"] else 1


if __name__ == "__main__":
    sys.exit(main())
