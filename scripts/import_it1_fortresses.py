#!/usr/bin/env python3
"""Import map-only dungeon/fortress coordinates from GGE Tracker IT1.

Cooldown and attack history are deliberately excluded. The collector preserves the
last good catalog if the API fails, returns an unknown schema, or yields no points.
"""
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "baron-fortresses.json"
API = "https://api.gge-tracker.com/api/v1/dungeons"
SERVER = "IT1"
PAGE_SIZE = 4000
MAX_PAGES = 20
KINGDOMS = {1: "sands", 2: "ice", 3: "fire"}


def now():
    return datetime.now(timezone.utc).isoformat()


def records_from(payload):
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return None
    for key in ("data", "dungeons", "results", "items", "content"):
        value = payload.get(key)
        if isinstance(value, list):
            return value
        if isinstance(value, dict):
            for nested in ("data", "dungeons", "results", "items"):
                if isinstance(value.get(nested), list):
                    return value[nested]
    return None


def integer(record, keys):
    for key in keys:
        value = record.get(key)
        if value is not None and value != "":
            try:
                n = int(value)
                if str(n) == str(value).strip() or isinstance(value, int):
                    return n
            except (TypeError, ValueError):
                pass
    return None


def normalize(record):
    if not isinstance(record, dict):
        return None
    kid = integer(record, ("kid", "kingdom_id", "kingdomId", "kingdom"))
    x = integer(record, ("position_x", "x", "posX", "X"))
    y = integer(record, ("position_y", "y", "posY", "Y"))
    if kid not in KINGDOMS or x is None or y is None or x < 0 or y < 0:
        return None
    stable_id = record.get("id", record.get("dungeon_id", record.get("object_id")))
    return {
        "id": str(stable_id) if stable_id is not None else f"it1-{kid}-{x}-{y}",
        "kid": kid,
        "x": x,
        "y": y,
        "kingdom": KINGDOMS[kid],
        "source_server": SERVER,
        "source": "GGE Tracker map data",
        "match_verified_on_target": False
    }


def fetch_page(page):
    query = urllib.parse.urlencode({
        "page": page,
        "size": PAGE_SIZE,
        "filterByKid": json.dumps([1, 2, 3], separators=(",", ":"))
    })
    req = urllib.request.Request(
        API + "?" + query,
        headers={"gge-server": SERVER, "Accept": "application/json",
                 "User-Agent": "Empirenew-Map-Importer/1.0"}
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError(f"GGE Tracker HTTP {response.status}")
        return json.loads(response.read().decode("utf-8"))


def main():
    all_points = {}
    pages_read = 0
    for page in range(1, MAX_PAGES + 1):
        payload = fetch_page(page)
        rows = records_from(payload)
        if rows is None:
            raise RuntimeError("Unknown GGE Tracker response schema; existing catalog preserved")
        pages_read += 1
        for row in rows:
            point = normalize(row)
            if point:
                all_points[(point["kid"], point["x"], point["y"])] = point
        # Stop when the API returns fewer rows than requested.
        if len(rows) < PAGE_SIZE:
            break
    if not all_points:
        raise RuntimeError("API returned no recognized coordinates; existing catalog preserved")
    if pages_read == MAX_PAGES:
        raise RuntimeError("Safety limit reached before proving pagination complete; existing catalog preserved")

    groups = {name: [] for name in ("sands", "ice", "fire")}
    for point in all_points.values():
        groups[point["kingdom"]].append(point)
    for values in groups.values():
        values.sort(key=lambda p: (p["x"], p["y"]))

    old = {}
    try:
        old = json.loads(OUT.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        pass
    # Never replace a larger previous complete catalog with a smaller result silently.
    old_total = int(old.get("total_count", 0) or 0)
    if old.get("complete") is True and len(all_points) < old_total:
        raise RuntimeError(f"New scan ({len(all_points)}) is smaller than last complete catalog ({old_total}); preserving old data")

    captured = now()
    output = {
        "schema_version": 2,
        "captured_at": captured,
        "source": "GGE Tracker public API",
        "server_source": SERVER,
        "target_server": "E4K_PL1",
        "complete": True,
        "pages_read": pages_read,
        "total_count": len(all_points),
        "results": {
            name: {"fortress_count": len(points), "complete": True, "fortresses": points}
            for name, points in groups.items()
        },
        "note": "Map-only import from desktop IT1. No attack cooldown or attack-history fields are imported. IT1 coordinates are not confirmed for E4K_PL1."
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(OUT)
    print(f"Imported {len(all_points)} map records from IT1 across {pages_read} page(s).")


if __name__ == "__main__":
    main()
