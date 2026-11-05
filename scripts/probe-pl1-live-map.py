#!/usr/bin/env python3
"""Read-only, local probe of selected E4K PL1 fortress coordinates.

The script never sends attacks or spies, never writes to the repository, and
never turns a cooldown into a guessed attack timestamp. Credentials are read
from the environment or prompted locally; they are never printed.
"""
from __future__ import annotations

import argparse
import getpass
import json
import math
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "data" / "baron-fortresses.json"
KINGDOM_ENUM_NAMES = {"sands": "SANDS", "ice": "ICE", "fire": "FIRE"}
FORBIDDEN_CATALOG_KEYS = ("cooldown", "attacked_at", "last_attack", "defeater", "player_id")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def validate_catalog(payload: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Accept only a complete IT1 coordinate catalog with no attack-state fields."""
    if payload.get("complete") is not True or payload.get("server_source") != "IT1":
        raise ValueError("Expected a complete GGE Tracker IT1 map-only catalog.")
    groups = payload.get("results")
    if not isinstance(groups, dict):
        raise ValueError("Catalog has no results object.")

    selected: dict[str, list[dict[str, Any]]] = {}
    seen: set[tuple[int, int, int]] = set()
    total = 0
    for kingdom in KINGDOM_ENUM_NAMES:
        group = groups.get(kingdom)
        if not isinstance(group, dict) or group.get("complete") is not True:
            raise ValueError(f"Catalog group {kingdom!r} is missing or incomplete.")
        points = group.get("fortresses")
        if not isinstance(points, list) or group.get("fortress_count") != len(points):
            raise ValueError(f"Catalog group {kingdom!r} has an invalid fortress count.")
        clean: list[dict[str, Any]] = []
        for point in points:
            if not isinstance(point, dict):
                raise ValueError(f"Invalid record in {kingdom!r}.")
            if any(any(token in key.lower() for token in FORBIDDEN_CATALOG_KEYS) for key in point):
                raise ValueError("The IT1 catalog unexpectedly contains attack/player state.")
            kid, x, y = point.get("kid"), point.get("x"), point.get("y")
            if not all(isinstance(value, int) and not isinstance(value, bool) for value in (kid, x, y)):
                raise ValueError(f"Non-integer coordinate in {kingdom!r}.")
            if x < 0 or y < 0:
                raise ValueError(f"Negative coordinate in {kingdom!r}.")
            key = (kid, x, y)
            if key in seen:
                raise ValueError(f"Duplicate IT1 coordinate {key}.")
            seen.add(key)
            clean.append(point)
        selected[kingdom] = sorted(clean, key=lambda p: (p["x"], p["y"], str(p.get("id", ""))))
        total += len(clean)

    if total != payload.get("total_count"):
        raise ValueError(f"Catalog total mismatch: groups={total}, declared={payload.get('total_count')}.")
    return selected


def pick_samples(points: list[dict[str, Any]], count: int) -> list[dict[str, Any]]:
    """Pick deterministic, evenly spaced points without duplicates."""
    if count < 1 or count > 10:
        raise ValueError("samples-per-kingdom must be between 1 and 10.")
    if len(points) <= count:
        return list(points)
    if count == 1:
        return [points[len(points) // 2]]
    indexes = [math.floor(i * (len(points) - 1) / (count - 1) + 0.5) for i in range(count)]
    return [points[index] for index in indexes]


def safe_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if hasattr(value, "name"):
        return str(value.name)
    if isinstance(value, (list, tuple)):
        return [safe_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): safe_value(item) for key, item in value.items()}
    return str(value)


def serialize_map_item(item: Any) -> dict[str, Any]:
    """Preserve raw map evidence; do not manufacture an attacked_at value."""
    item_type = safe_value(getattr(item, "item_type", None))
    if isinstance(item_type, str) and item_type.startswith("MapItemType."):
        item_type = item_type.rsplit(".", 1)[-1]
    defeater_id = safe_value(getattr(item, "defeater_player_id", None))
    return {
        "item_type": item_type,
        "x": safe_value(getattr(item, "x", None)),
        "y": safe_value(getattr(item, "y", None)),
        "owner_id": safe_value(getattr(item, "owner_id", None)),
        "dungeon_level": safe_value(getattr(item, "dungeon_level", None)),
        "attack_cooldown_seconds": safe_value(getattr(item, "attack_cooldown_seconds", None)),
        "total_cooldown_seconds": safe_value(getattr(item, "total_cooldown_seconds", None)),
        "victory_count": safe_value(getattr(item, "victory_count", None)),
        "defeater_player_id": defeater_id,
        "is_defeated": safe_value(getattr(item, "is_defeated", None)),
        "raw_row": safe_value(getattr(item, "raw_data", None)),
        "boss_defeater_lookup_applicable": item_type == "BOSS_DUNGEON" and defeater_id is not None,
        "attack_time": None,
        "attack_time_note": "The live map row does not provide a verified absolute attack timestamp.",
    }


def build_sample_result(
    target: dict[str, Any], items: list[Any], failed_chunks: list[Any], sampled_at: str
) -> dict[str, Any]:
    x, y = target["x"], target["y"]
    exact = [item for item in items if getattr(item, "x", None) == x and getattr(item, "y", None) == y]
    if failed_chunks:
        status = "partial_scan"
    elif exact:
        status = "row_found"
    else:
        status = "not_confirmed"
    return {
        "target": {
            "id": target.get("id"),
            "kid": target["kid"],
            "kingdom": target["kingdom"],
            "x": x,
            "y": y,
            "coordinate_source": "GGE Tracker IT1; PL1 coordinate alignment supplied by operator",
        },
        "sampled_at_utc": sampled_at,
        "status": status,
        "failed_chunk_count": len(failed_chunks),
        "rows": [serialize_map_item(item) for item in exact],
        "note": (
            "A missing exact row is not proof that the coordinate is invalid."
            if not exact else
            "Map state only; this is not a complete attack-history record."
        ),
    }


def resolve_boss_defeater(client: Any, row: dict[str, Any], cache: dict[int, Any]) -> None:
    """Resolve only the documented boss-dungeon defeater id; never infer an attacker."""
    if not row.get("boss_defeater_lookup_applicable"):
        return
    player_id = row.get("defeater_player_id")
    if not isinstance(player_id, int) or player_id <= 0:
        return
    if player_id not in cache:
        try:
            details = client.player.get_player_info(player_id, timeout=8.0)
            cache[player_id] = {
                "status": "resolved",
                "player_name": safe_value(getattr(details, "player_name", None)),
                "alliance_name": safe_value(getattr(details, "alliance_name", None)),
            }
        except Exception as exc:  # diagnostic only; no fallback guessing
            cache[player_id] = {"status": "lookup_failed", "error_type": type(exc).__name__}
    row["boss_defeater"] = {"player_id": player_id, **cache[player_id]}


def run_probe(args: argparse.Namespace) -> int:
    username = os.getenv("GGE_USERNAME") or input("Login do E4K PL1: ").strip()
    password = os.getenv("GGE_PASSWORD") or getpass.getpass("Hasło (nie będzie wyświetlane): ")
    if not username or not password:
        print("Brak loginu lub hasła; niczego nie wysłano.", file=sys.stderr)
        return 2

    try:
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        groups = validate_catalog(catalog)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"Katalog IT1 odrzucony: {exc}", file=sys.stderr)
        return 2

    try:
        from empire_core import EmpireClient, EmpireConfig, Kingdom, instance_for_zone
    except ImportError:
        print('Brak EmpireCore. Zainstaluj lokalnie: python -m pip install "empire-core==0.63.0"', file=sys.stderr)
        return 2

    try:
        instance = instance_for_zone(args.zone, game_id=args.game_id, network_id=args.network_id)
        config = EmpireConfig.for_instance(instance, username=username, password=password)
    except Exception as exc:
        print(
            f"Nie udało się jednoznacznie rozpoznać serwera zone={args.zone!r}, "
            f"game_id={args.game_id}, network_id={args.network_id}: {type(exc).__name__}: {exc}",
            file=sys.stderr,
        )
        return 2

    kingdom_enums = {
        "sands": Kingdom.SANDS,
        "ice": Kingdom.ICE,
        "fire": Kingdom.FIRE,
    }
    selected = {
        name: pick_samples(points, args.samples_per_kingdom)
        for name, points in groups.items()
    }
    output: dict[str, Any] = {
        "schema_version": 1,
        "probe": "read-only E4K PL1 map sample",
        "target_server": "E4K_PL1",
        "zone": instance.zone,
        "game_server_host": instance.server,
        "game_id": args.game_id,
        "network_id": args.network_id,
        "coordinate_source": "GGE Tracker IT1; coordinate alignment supplied by operator",
        "catalog_captured_at": catalog.get("captured_at"),
        "started_at_utc": utc_now(),
        "samples_per_kingdom": args.samples_per_kingdom,
        "results": [],
        "attack_history_status": "not_proven",
        "warning": (
            "Cooldown and defeater fields are raw map observations only. "
            "No absolute attack timestamp is inferred or created."
        ),
    }

    try:
        with EmpireClient(config=config) as client:
            client.login()
            if not client.is_logged_in:
                raise RuntimeError("EmpireCore did not confirm a logged-in session.")
            defeater_cache: dict[int, Any] = {}
            for kingdom_name, targets in selected.items():
                for target in targets:
                    sampled_at = utc_now()
                    try:
                        scan = client.map.scan_around(
                            target["x"], target["y"], 1, kingdom_enums[kingdom_name], timeout=8.0
                        )
                        result = build_sample_result(
                            target,
                            list(getattr(scan, "items", []) or []),
                            list(getattr(scan, "failed_chunks", []) or []),
                            sampled_at,
                        )
                        for row in result["rows"]:
                            resolve_boss_defeater(client, row, defeater_cache)
                        output["results"].append(result)
                    except Exception as exc:
                        output["results"].append({
                            "target": {"kid": target["kid"], "kingdom": kingdom_name,
                                       "x": target["x"], "y": target["y"]},
                            "sampled_at_utc": sampled_at,
                            "status": "request_error",
                            "error_type": type(exc).__name__,
                            "note": "No attack event was recorded from this failed request.",
                        })
                    time.sleep(0.25)
    except Exception as exc:
        output["session_error"] = {"type": type(exc).__name__, "message": str(exc)[:500]}
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return 1

    output["finished_at_utc"] = utc_now()
    output["summary"] = {
        "requested": len(output["results"]),
        "rows_found": sum(r.get("status") == "row_found" for r in output["results"]),
        "not_confirmed": sum(r.get("status") == "not_confirmed" for r in output["results"]),
        "partial": sum(r.get("status") == "partial_scan" for r in output["results"]),
        "errors": sum(r.get("status") == "request_error" for r in output["results"]),
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zone", default=os.getenv("GGE_ZONE", "EmpirefourkingdomsExGG2_3"))
    parser.add_argument("--game-id", type=int, default=int(os.getenv("GGE_GAME_ID", "12")))
    parser.add_argument("--network-id", type=int, default=int(os.getenv("GGE_NETWORK_ID", "1")))
    parser.add_argument("--samples-per-kingdom", type=int, default=3)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(run_probe(parse_args()))
