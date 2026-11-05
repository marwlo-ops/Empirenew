#!/usr/bin/env python3
"""Read-only E4K PL1 map diagnostics with fail-safe snapshot writes.

The public empire-api bridge currently has a response-matching defect for
commands not declared in data/commands.json. This tool reports the raw HTTP
result and never overwrites the live snapshot unless it can validate at least
one explicitly NPC-labelled object with numeric X/Y coordinates.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

DEFAULT_BASE = "https://empire-api.fly.dev"
DEFAULT_SERVER = "EmpirefourkingdomsExGG2_3"
NPC_WORDS = re.compile(r"(npc|baron|robber|dungeon|fortress|stronghold|camp|rozb[oó]j|baron|loch|twierd|ob[oó]z)", re.I)


class ProbeError(RuntimeError):
    pass


def build_url(base: str, server: str, command: str, params: dict[str, Any]) -> str:
    # The bridge parses JSON.parse('{' + routeParam + '}'), so send members
    # without the outer braces. quote() encodes quotes/commas/colons exactly once.
    members = json.dumps(params, ensure_ascii=False, separators=(",", ":"))[1:-1]
    return f"{base.rstrip('/')}/{quote(server, safe='')}/{command}/{quote(members, safe='')}"


def request_command(base: str, server: str, command: str,
                    params: dict[str, Any], timeout: int) -> dict[str, Any]:
    url = build_url(base, server, command, params)
    req = Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "Empirenew-NPC-map-diagnostic/1.0",
    })
    try:
        with urlopen(req, timeout=timeout) as response:
            status = response.status
            body = response.read().decode("utf-8", "replace")
    except HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        raise ProbeError(f"{command}: HTTP {exc.code}; url={url}; body={body[:3000]}") from exc
    except (URLError, TimeoutError) as exc:
        raise ProbeError(f"{command}: transport error; url={url}; error={exc}") from exc

    if status != 200:
        raise ProbeError(f"{command}: HTTP {status}; url={url}; body={body[:3000]}")
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise ProbeError(f"{command}: HTTP 200 but invalid JSON: {body[:1000]}") from exc
    if not isinstance(payload, dict):
        raise ProbeError(f"{command}: response root is not an object")
    return {"http_status": status, "url": url, "payload": payload}


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
        # Do not infer NPC identity from coordinates or opaque numeric type IDs.
        searchable = " ".join(
            str(obj.get(k, "")) for k in
            ("type", "Type", "type_name", "name", "N", "owner", "owner_name",
             "category", "kind", "object_type", "npc_type")
        )
        if not NPC_WORDS.search(searchable):
            continue
        found.append({
            "kingdom_id": kingdom,
            "x": pos[0],
            "y": pos[1],
            "label": searchable[:160],
            "source_path": path,
            "raw": obj,
        })
    # Deduplicate only identical coordinate+label records.
    unique = {}
    for item in found:
        unique[(item["x"], item["y"], item["label"])] = item
    return list(unique.values())


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

    tests = [
        ("gaa", {"KID": args.kingdom, "AX1": args.x, "AY1": args.y,
                 "AX2": args.x + args.chunk_size, "AY2": args.y + args.chunk_size}),
        ("fnm", {"T": 2, "KID": args.kingdom, "LMIN": 1, "LMAX": -1, "NID": -1}),
    ]
    report = {
        "tested_at": datetime.now(timezone.utc).isoformat(),
        "server": args.server,
        "base": args.base,
        "kingdom": args.kingdom,
        "tests": [],
        "validated_npc_count": 0,
        "snapshot_written": False,
    }
    all_npcs = []
    for command, params in tests:
        try:
            result = request_command(args.base, args.server, command, params, args.timeout)
            payload = result["payload"]
            entry = {
                "command": command,
                "http_status": result["http_status"],
                "return_code": payload.get("return_code"),
                "response_command": payload.get("command"),
                "content_type": type(payload.get("content")).__name__,
                "content_preview": json.dumps(payload.get("content"), ensure_ascii=False)[:3500],
                "ok": True,
            }
            if str(payload.get("return_code")) != "0":
                entry["ok"] = False
                entry["error"] = f"game return_code={payload.get('return_code')}"
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
        time.sleep(0.5)

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
