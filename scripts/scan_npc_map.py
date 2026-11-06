#!/usr/bin/env python3
"""Read-only preflight for the public E4K PL1 map bridge.

The audited public bridge has no response-key mappings for GAA/FNM. This tool
checks the target socket first and skips those commands until the adapter can
correlate their replies safely. It emits redacted diagnostics and never
overwrites the live snapshot without an explicitly NPC-labelled object.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

DEFAULT_BASE = "https://empire-api.fly.dev"
DEFAULT_SERVER = "EmpirefourkingdomsExGG_3"  # Pinned production PL1 zone from e4k-data
# Audited upstream empire-api data/commands.json: GAA and FNM have no response-key mapping.
BRIDGE_RESPONSE_MAPPED_COMMANDS = frozenset({"wsp", "gdi", "hgh", "ain", "llsp", "llsw", "slse"})
MAP_COMMANDS = ("gaa", "fnm")
NPC_WORDS = re.compile(r"(npc|baron|robber|dungeon|fortress|stronghold|camp|rozb[oó]j|baron|loch|twierd|ob[oó]z)", re.I)


class ProbeError(RuntimeError):
    pass


def build_url(base: str, server: str, command: str, params: dict[str, Any]) -> str:
    # The bridge parses JSON.parse('{' + routeParam + '}'), so send members
    # without the outer braces. quote() encodes quotes/commas/colons exactly once.
    members = json.dumps(params, ensure_ascii=False, separators=(",", ":"))[1:-1]
    return f"{base.rstrip('/')}/{quote(server, safe='')}/{command}/{quote(members, safe='')}"


def safe_origin(base: str) -> str:
    """Return only the HTTP(S) origin; never echo URL userinfo, path, query or fragment."""
    try:
        parsed = urlsplit(base)
        hostname = parsed.hostname
        if parsed.scheme not in ("http", "https") or not hostname:
            return "configured endpoint"
        host = f"[{hostname}]" if ":" in hostname and not hostname.startswith("[") else hostname
        port = parsed.port
        return f"{parsed.scheme.lower()}://{host}" + (f":{port}" if port is not None else "")
    except (TypeError, ValueError):
        return "configured endpoint"


def validate_api_base(base: str) -> None:
    """Reject embedded credentials and ambiguous URL components before making a request."""
    try:
        parsed = urlsplit(base)
        hostname = parsed.hostname
        _ = parsed.port
    except (TypeError, ValueError) as exc:
        raise ProbeError("API base must be a valid HTTP(S) URL without embedded credentials.") from exc
    if (
        parsed.scheme not in ("http", "https")
        or not hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise ProbeError("API base must be an HTTP(S) URL without embedded credentials, query or fragment.")


def request_command(base: str, server: str, command: str,
                    params: dict[str, Any], timeout: int) -> dict[str, Any]:
    validate_api_base(base)
    url = build_url(base, server, command, params)
    headers = {
        "Accept": "application/json",
        "User-Agent": "Empirenew-NPC-map-diagnostic/1.1",
    }
    api_token = os.getenv("E4K_API_TOKEN")
    if api_token:
        headers["Authorization"] = f"Bearer {api_token}"
    req = Request(url, headers=headers)
    try:
        with urlopen(req, timeout=timeout) as response:
            status = response.status
            body = response.read().decode("utf-8", "replace")
    except HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        raise ProbeError(f"{command}: HTTP {exc.code}; response body redacted") from exc
    except (URLError, TimeoutError) as exc:
        raise ProbeError(f"{command}: transport error ({type(exc).__name__})") from exc

    if status != 200:
        raise ProbeError(f"{command}: HTTP {status}; response body redacted")
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise ProbeError(f"{command}: HTTP 200 but invalid JSON; response body redacted") from exc
    if not isinstance(payload, dict):
        raise ProbeError(f"{command}: response root is not an object")
    return {"http_status": status, "payload": payload}



def request_bridge_status(base: str, server: str, timeout: int) -> dict[str, Any]:
    """Read only the bridge's server->connected status map; never emit its keys."""
    validate_api_base(base)
    headers = {
        "Accept": "application/json",
        "User-Agent": "Empirenew-NPC-map-diagnostic/1.2",
    }
    api_token = os.getenv("E4K_API_TOKEN")
    if api_token:
        headers["Authorization"] = f"Bearer {api_token}"
    req = Request(base.rstrip("/") + "/status", headers=headers)
    try:
        with urlopen(req, timeout=timeout) as response:
            status = response.status
            body = response.read().decode("utf-8", "replace")
    except HTTPError as exc:
        raise ProbeError(f"bridge status: HTTP {exc.code}; response body redacted") from exc
    except (URLError, TimeoutError) as exc:
        raise ProbeError(f"bridge status: transport error ({type(exc).__name__})") from exc

    if status != 200:
        raise ProbeError(f"bridge status: HTTP {status}; response body redacted")
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise ProbeError("bridge status: HTTP 200 but invalid JSON; response body redacted") from exc
    if not isinstance(payload, dict):
        raise ProbeError("bridge status: response root is not an object")

    connected = payload.get(server)
    return {
        "http_status": status,
        "target_connected": connected if isinstance(connected, bool) else None,
        "known_server_count": len(payload),
    }


def build_map_command_plan(target_connected: bool | None, kingdom: int,
                           x: int, y: int, chunk_size: int) -> list[dict[str, Any]]:
    """Plan only commands that the bridge can correlate; skip unmapped GAA/FNM."""
    commands = (
        ("gaa", {"KID": kingdom, "AX1": x, "AY1": y,
                 "AX2": x + chunk_size, "AY2": y + chunk_size}),
        ("fnm", {"T": 2, "KID": kingdom, "LMIN": 1, "LMAX": -1, "NID": -1}),
    )
    plan = []
    for command, params in commands:
        if target_connected is False:
            reason = "target_socket_not_connected"
        elif target_connected is not True:
            reason = "bridge_status_unavailable_or_target_unknown"
        elif command not in BRIDGE_RESPONSE_MAPPED_COMMANDS:
            reason = "bridge_response_key_mapping_missing"
        else:
            reason = None
        plan.append({"command": command, "params": params, "skip_reason": reason})
    return plan

def walk(value: Any, path: str = "$"):
    if isinstance(value, dict):
        yield path, value
        for key, child in value.items():
            yield from walk(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk(child, f"{path}[{index}]")


def coordinate_pair(obj: dict[str, Any]):
    aliases = [
        ("x", "y"), ("X", "Y"), ("posX", "posY"),
        ("PX", "PY"), ("AX", "AY"),
    ]
    for x_key, y_key in aliases:
        if x_key in obj and y_key in obj:
            try:
                x, y = float(obj[x_key]), float(obj[y_key])
            except (TypeError, ValueError):
                continue
            if x.is_integer() and y.is_integer() and 0 <= x <= 10000 and 0 <= y <= 10000:
                return int(x), int(y)
    pos = obj.get("pos") or obj.get("POS")
    if isinstance(pos, dict):
        return coordinate_pair(pos)
    if isinstance(pos, (list, tuple)) and len(pos) >= 2:
        try:
            x, y = float(pos[0]), float(pos[1])
            if x.is_integer() and y.is_integer() and 0 <= x <= 10000 and 0 <= y <= 10000:
                return int(x), int(y)
        except (TypeError, ValueError):
            pass
    return None


def extract_explicit_npcs(payload: dict[str, Any], kingdom: int):
    content = payload.get("content")
    if content is None:
        raise ProbeError("HTTP 200 but response has no 'content' field")
    found = []
    for path, obj in walk(content):
        pos = coordinate_pair(obj)
        if not pos:
            continue
        # Classify only from object-type fields; never copy names or owner/player values.
        classification = " ".join(
            str(obj[k]).strip() for k in
            ("type", "Type", "type_name", "category", "kind", "object_type", "npc_type")
            if obj.get(k) not in (None, "")
        )
        match = NPC_WORDS.search(classification)
        if not match:
            continue
        found.append({
            "kingdom_id": kingdom,
            "x": pos[0],
            "y": pos[1],
            # Keep only the matched generic NPC keyword, never the full source value.
            "label": match.group(0).lower(),
        })
    # Deduplicate only identical coordinate+label records.
    unique = {}
    for item in found:
        unique[(item["x"], item["y"], item["label"])] = item
    return list(unique.values())


def summarize_content(content: Any) -> dict[str, Any]:
    """Return a structural, PII-free summary suitable for public CI artifacts."""
    if isinstance(content, list):
        top_level_item_count = len(content)
        first = content[0] if content else None
    elif isinstance(content, dict):
        top_level_item_count = len(content)
        first = content
    else:
        top_level_item_count = None
        first = None

    coordinate_pairs = []
    seen_coordinates = set()
    for _, obj in walk(content):
        pair = coordinate_pair(obj)
        if pair and pair not in seen_coordinates:
            seen_coordinates.add(pair)
            coordinate_pairs.append({"x": pair[0], "y": pair[1]})

    return {
        "json_type": type(content).__name__,
        "top_level_item_count": top_level_item_count,
        # Never emit object keys: some APIs use player names as dynamic keys.
        "top_level_field_count": len(first) if isinstance(first, dict) else 0,
        "coordinate_object_count": len(coordinate_pairs),
        "coordinate_samples": coordinate_pairs[:5],
    }


def atomic_write(path: Path, data: dict[str, Any]):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    except Exception:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=os.getenv("E4K_API_BASE", DEFAULT_BASE))
    parser.add_argument("--server", default=os.getenv("E4K_SERVER", DEFAULT_SERVER))
    parser.add_argument("--kingdom", type=int, default=1)
    parser.add_argument("--x", type=int, default=0)
    parser.add_argument("--y", type=int, default=0)
    parser.add_argument("--chunk-size", type=int, default=12)
    parser.add_argument("--timeout", type=int, default=20)
    parser.add_argument("--output", type=Path, default=None,
                        help="Optional snapshot path. No file is written unless >=1 explicit NPC is validated.")
    parser.add_argument("--diagnostic", type=Path, default=None,
                        help="Optional diagnostic JSON path; never replaces the production snapshot.")
    args = parser.parse_args()

    if args.chunk_size < 1 or args.chunk_size > 50:
        parser.error("--chunk-size must be between 1 and 50")

    report = {
        "tested_at": datetime.now(timezone.utc).isoformat(),
        "server": args.server,
        "base": safe_origin(args.base),
        "kingdom": args.kingdom,
        "bridge_status": None,
        "tests": [],
        "validated_npc_count": 0,
        "snapshot_written": False,
    }

    try:
        bridge_status = request_bridge_status(args.base, args.server, args.timeout)
        report["bridge_status"] = bridge_status
        target_connected = bridge_status["target_connected"]
    except ProbeError as exc:
        report["bridge_status"] = {
            "http_status": None,
            "target_connected": None,
            "known_server_count": None,
            "error": str(exc),
        }
        target_connected = None

    all_npcs = []
    for planned in build_map_command_plan(
        target_connected, args.kingdom, args.x, args.y, args.chunk_size
    ):
        command = planned["command"]
        if planned["skip_reason"]:
            report["tests"].append({
                "command": command,
                "ok": False,
                "skipped": True,
                "reason": planned["skip_reason"],
            })
            continue

        # Retained for a future audited bridge mapping. GAA/FNM are currently
        # absent from the public adapter's response-key map.
        try:
            result = request_command(
                args.base, args.server, command, planned["params"], args.timeout
            )
            payload = result["payload"]
            entry = {
                "command": command,
                "http_status": result["http_status"],
                "return_code": payload.get("return_code"),
                "response_command": payload.get("command"),
                "content_type": type(payload.get("content")).__name__,
                "content_summary": summarize_content(payload.get("content")),
                "ok": True,
            }
            if str(payload.get("return_code")) != "0":
                entry["ok"] = False
                entry["error"] = "game returned a non-success status"
            else:
                try:
                    npcs = extract_explicit_npcs(payload, args.kingdom)
                    entry["explicit_npc_count"] = len(npcs)
                    all_npcs.extend(npcs)
                except ProbeError as exc:
                    entry["ok"] = False
                    entry["error"] = str(exc)
            report["tests"].append(entry)
        except ProbeError as exc:
            report["tests"].append({"command": command, "ok": False, "error": str(exc)})

    deduped = {(n["x"], n["y"], n["label"]): n for n in all_npcs}
    all_npcs = list(deduped.values())
    report["validated_npc_count"] = len(all_npcs)

    if args.output:
        if not all_npcs:
            report["snapshot_error"] = (
                "Fail-safe: no explicitly NPC-labelled object with validated X/Y; "
                "production snapshot left unchanged."
            )
        else:
            snapshot = {
                "schema_version": 1,
                "captured_at": report["tested_at"],
                "server": args.server,
                "source": "empire-api read-only gaa/fnm",
                "complete": False,
                "results": {
                    str(args.kingdom): {
                        "fortress_count": len(all_npcs),
                        "failed_chunks": 0,
                        "complete": False,
                        "fortresses": all_npcs,
                    }
                },
            }
            atomic_write(args.output, snapshot)
            report["snapshot_written"] = True
            report["snapshot_path"] = str(args.output)

    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    print(rendered)
    if args.diagnostic:
        atomic_write(args.diagnostic, report)

    if not all(test.get("ok") for test in report["tests"]):
        return 2
    if args.output and not all_npcs:
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
