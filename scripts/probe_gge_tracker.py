#!/usr/bin/env python3
"""Read-only compatibility probe for the public GGE Tracker dungeon API.

Tests whether the currently published API serves production E4K_PL1 (and,
for comparison only, E4K_PL1_BETA). This script never writes application data.
"""
import json
import sys
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from urllib.parse import urlencode

BASE = "https://api.gge-tracker.com/api/v1/dungeons"
PARAMS = {"page": 1, "size": 3, "filterByKid": "[1]"}

def probe(server):
    url = BASE + "?" + urlencode(PARAMS)
    request = Request(url, headers={
        "gge-server": server,
        "Accept": "application/json",
        "User-Agent": "Empirenew-readonly-provider-probe/1.0",
    })
    try:
        with urlopen(request, timeout=20) as response:
            body = response.read().decode("utf-8", "replace")
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                payload = {"raw": body[:2000]}
            rows = payload.get("dungeons", []) if isinstance(payload, dict) else []
            coords = []
            for row in rows if isinstance(rows, list) else []:
                if not isinstance(row, dict):
                    continue
                x = row.get("x", row.get("position_x"))
                y = row.get("y", row.get("position_y"))
                if isinstance(x, (int, float)) and isinstance(y, (int, float)):
                    coords.append({"x": x, "y": y})
            return {
                "server": server, "http_status": response.status,
                "return_code": payload.get("return_code") if isinstance(payload, dict) else None,
                "keys": list(payload.keys()) if isinstance(payload, dict) else [],
                "dungeon_count_in_sample": len(rows) if isinstance(rows, list) else None,
                "sample_coordinates": coords[:3],
                "body_preview": json.dumps(payload, ensure_ascii=False)[:2500],
                "ok": response.status == 200 and isinstance(rows, list),
            }
    except HTTPError as error:
        body = error.read().decode("utf-8", "replace")
        return {"server": server, "http_status": error.code, "body_preview": body[:2000], "ok": False}
    except (URLError, TimeoutError) as error:
        return {"server": server, "error": str(error), "ok": False}

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
    report["production_supported"] = bool(prod.get("ok") and prod.get("dungeon_count_in_sample", 0) > 0)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["production_supported"] else 1

if __name__ == "__main__":
    sys.exit(main())
