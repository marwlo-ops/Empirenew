#!/usr/bin/env python3
"""Import map-only fortress coordinates from GGE Tracker IT1.

The public catalog deliberately excludes cooldown, readiness, player and attack
history. The last known-good catalog is preserved on any incomplete/invalid scan.
"""
import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "baron-fortresses.json"
API = "https://api.gge-tracker.com/api/v1/dungeons"
SERVER = "IT1"
TARGET_SERVER = "E4K_PL1"
PAGE_SIZE = 4000
MAX_PAGES = 20
MAX_COORDINATE = 1286
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
        if isinstance(value, bool):
            return None
        if value is not None and value != "":
            try:
                n = int(value)
                if str(n) == str(value).strip() or isinstance(value, int):
                    return n
            except (TypeError, ValueError):
                pass
    return None


def pagination_info(payload):
    """Require and validate GGE Tracker pagination metadata for every page.

    Missing, unknown or invalid metadata is a hard failure so an incomplete
    API response cannot replace the last known-good catalog.
    """
    if not isinstance(payload, dict) or "pagination" not in payload:
        raise RuntimeError("Missing GGE Tracker pagination metadata; existing catalog preserved")
    meta = payload.get("pagination")
    if not isinstance(meta, dict):
        raise RuntimeError("Invalid GGE Tracker pagination object; existing catalog preserved")

    values = {
        "current_page": integer(meta, ("current_page", "currentPage", "page")),
        "total_pages": integer(meta, ("total_pages", "totalPages")),
        "current_items_count": integer(meta, ("current_items_count", "currentItemsCount")),
        "total_items_count": integer(meta, ("total_items_count", "totalItemsCount")),
    }
    if any(value is None for value in values.values()):
        raise RuntimeError("Incomplete or non-integer GGE Tracker pagination metadata; existing catalog preserved")
    if (
        values["current_page"] < 1
        or values["total_pages"] < 1
        or values["current_page"] > values["total_pages"]
        or values["current_items_count"] < 0
        or values["total_items_count"] < 0
    ):
        raise RuntimeError("Out-of-range GGE Tracker pagination metadata; existing catalog preserved")
    return values


def normalize(record):
    if not isinstance(record, dict):
        return None
    kid = integer(record, ("kid", "kingdom_id", "kingdomId", "kingdom"))
    x = integer(record, ("position_x", "x", "posX", "X"))
    y = integer(record, ("position_y", "y", "posY", "Y"))
    area_type = integer(record, ("area_type", "areaType"))
    if area_type is not None and area_type != 11:
        return None
    if (
        kid not in KINGDOMS
        or x is None
        or y is None
        or not 0 <= x <= MAX_COORDINATE
        or not 0 <= y <= MAX_COORDINATE
    ):
        return None
    stable_id = next((
        record.get(key) for key in ("id", "dungeon_id", "object_id")
        if record.get(key) is not None and str(record.get(key)).strip()
    ), None)
    stable_id_text = str(stable_id).strip() if stable_id is not None else ""
    # Keep the public schema identical to the catalog consumed by Barony/probe.
    # Never copy arbitrary API fields (especially player/cooldown/history fields).
    return {
        "id": stable_id_text or f"it1-{kid}-{x}-{y}",
        "kid": kid,
        "kingdom": KINGDOMS[kid],
        "x": x,
        "y": y,
        "type": "dungeon",
        "source_server": SERVER,
    }


def validate_unique_ids(points):
    """Reject missing or repeated stable IDs before replacing the public catalog."""
    seen = set()
    for point in points:
        stable_id = point.get("id") if isinstance(point, dict) else None
        if not isinstance(stable_id, str) or not stable_id.strip():
            raise RuntimeError("Invalid IT1 fortress ID; existing catalog preserved")
        if stable_id in seen:
            raise RuntimeError(f"Duplicate IT1 fortress ID {stable_id}; existing catalog preserved")
        seen.add(stable_id)


def fetch_page(page):
    query = urllib.parse.urlencode({
        "page": page,
        "size": PAGE_SIZE,
        "filterByKid": json.dumps([1, 2, 3], separators=(",", ":"))
    })
    req = urllib.request.Request(
        API + "?" + query,
        headers={
            "gge-server": SERVER,
            "Accept": "application/json",
            "User-Agent": "Empirenew-Map-Importer/1.0",
        }
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError(f"GGE Tracker HTTP {response.status}")
        return json.loads(response.read().decode("utf-8"))


def main():
    all_points = {}
    pages_read = 0
    pagination_complete = False
    expected_pages = None
    expected_total = None
    for page in range(1, MAX_PAGES + 1):
        payload = fetch_page(page)
        rows = records_from(payload)
        if rows is None:
            raise RuntimeError("Unknown GGE Tracker response schema; existing catalog preserved")
        metadata = pagination_info(payload)
        pages_read += 1

        if metadata["current_page"] != page:
            raise RuntimeError("GGE Tracker returned an unexpected page number; existing catalog preserved")
        if expected_pages is None:
            expected_pages = metadata["total_pages"]
            expected_total = metadata["total_items_count"]
            if expected_pages > MAX_PAGES:
                raise RuntimeError("GGE Tracker pagination exceeds the configured safety limit; existing catalog preserved")
        elif (
            metadata["total_pages"] != expected_pages
            or metadata["total_items_count"] != expected_total
        ):
            raise RuntimeError("GGE Tracker pagination changed while reading IT1; existing catalog preserved")
        if len(rows) != metadata["current_items_count"]:
            raise RuntimeError("GGE Tracker page item count does not match its metadata; existing catalog preserved")
        if page > expected_pages:
            raise RuntimeError("GGE Tracker returned more pages than declared; existing catalog preserved")

        for row in rows:
            point = normalize(row)
            if point:
                key = (point["kid"], point["x"], point["y"])
                if key in all_points:
                    raise RuntimeError(f"Duplicate IT1 coordinate {key}; existing catalog preserved")
                all_points[key] = point

        if page == metadata["total_pages"]:
            pagination_complete = True
            break

    if not pagination_complete:
        raise RuntimeError("Safety limit reached before proving pagination complete; existing catalog preserved")
    if expected_pages is not None and pages_read != expected_pages:
        raise RuntimeError("GGE Tracker page count does not match its pagination metadata; existing catalog preserved")
    if expected_total is not None and len(all_points) != expected_total:
        raise RuntimeError(
            f"GGE Tracker returned {len(all_points)} unique valid coordinates but pagination declares {expected_total}; existing catalog preserved"
        )
    if not all_points:
        raise RuntimeError("API returned no recognized coordinates; existing catalog preserved")
    validate_unique_ids(all_points.values())

    groups = {name: [] for name in ("sands", "ice", "fire")}
    for point in all_points.values():
        groups[point["kingdom"]].append(point)
    for name, values in groups.items():
        if not values:
            raise RuntimeError(f"GGE Tracker returned no IT1 points for {name}; existing catalog preserved")
        values.sort(key=lambda p: (p["x"], p["y"]))

    old = {}
    try:
        old = json.loads(OUT.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        pass
    old_total = int(old.get("total_count", 0) or 0)
    if old.get("complete") is True and len(all_points) < old_total:
        raise RuntimeError(
            f"New scan ({len(all_points)}) is smaller than last complete catalog ({old_total}); preserving old data"
        )

    captured = now()
    output = {
        "schema_version": 2,
        "captured_at": captured,
        "source": "GGE Tracker public API · map coordinates only",
        "server_source": SERVER,
        "target_server": TARGET_SERVER,
        "coordinate_alignment": "operator_confirmed; not independently live-verified by this importer",
        "complete": True,
        "pages_read": pages_read,
        "total_count": len(all_points),
        "results": {
            name: {"fortress_count": len(points), "complete": True, "fortresses": points}
            for name, points in groups.items()
        },
        "note": (
            "IT1 is the map-coordinate source. The coordinate grid alignment with production E4K PL1 "
            "was confirmed by the operator; this import does not verify current PL1 object presence. "
            "No cooldown, readiness, player or attack-history fields are imported."
        ),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(OUT)
    print(f"Imported {len(all_points)} map-only IT1 records across {pages_read} page(s).")


if __name__ == "__main__":
    main()
