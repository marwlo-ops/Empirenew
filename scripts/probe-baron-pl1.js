import { readFile } from "node:fs/promises";

// Read-only diagnostics. Never persist player names, IDs, cooldowns or inferred attacks.
const base = "https://api.gge-tracker.com/api/v1";
const bridgeBase = "https://empire-api.fly.dev";
const targetServer = "EmpirefourkingdomsExGG2_3";
const timeout = 20_000;

async function get(url, headers = {}, timeoutMs = timeout) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", ...headers },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = null; }
  return { response, body, raw };
}
function log(value) { console.log(JSON.stringify(value)); }
function serverHeader(server) { return { "gge-server": server }; }

async function probeGgeTracker() {
  try {
    const { response, body } = await get(base + "/servers");
    const entries = Array.isArray(body) ? body : (Array.isArray(body?.servers) ? body.servers : []);
    const candidates = entries
      .filter(item => JSON.stringify(item).toUpperCase().includes("E4K_PL1"))
      .slice(0, 10)
      .map(item => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return item;
        return Object.fromEntries(Object.entries(item).filter(([key, value]) =>
          /server|code|name|id|country|region/i.test(key) && (typeof value !== "object" || value === null)
        ));
      });
    log({
      probe: "server-list", http_status: response.status, entry_count: entries.length || null,
      mentions_e4k_pl1: JSON.stringify(body || []).toUpperCase().includes("E4K_PL1"),
      mentions_e4k_pl1_beta: JSON.stringify(body || []).toUpperCase().includes("E4K_PL1_BETA"),
      candidate_entries: candidates
    });
  } catch (error) { log({ probe: "server-list", error: String(error) }); }

  try {
    const { response, raw } = await get(base + "/servers/catalog", {
      Accept: "application/xml, text/xml, */*"
    });
    const snippets = {};
    for (const alias of ["E4K_PL1", "E4K_PL1_BETA"]) {
      const index = raw.indexOf(alias);
      snippets[alias] = index < 0 ? null : raw
        .slice(Math.max(0, index - 350), Math.min(raw.length, index + 700))
        .replace(/\s+/g, " ");
    }
    log({
      probe: "server-catalog", http_status: response.status,
      content_type: response.headers.get("content-type"), bytes: raw.length, server_entries: snippets
    });
  } catch (error) { log({ probe: "server-catalog", error: String(error) }); }

  for (const server of [targetServer, "E4K_PL1", "E4K_PL1_BETA", "PL1", "IT1"]) {
    try {
      const url = base + "/dungeons?page=1&size=1&filterByKid=" + encodeURIComponent("[1,2,3]");
      const { response, body } = await get(url, serverHeader(server));
      const rows = Array.isArray(body?.dungeons) ? body.dungeons : null;
      const first = rows?.[0] ?? null;
      log({
        probe: "dungeons", server, http_status: response.status, error: body?.error ?? null,
        count_in_sample: rows?.length ?? null, pagination: body?.pagination ?? null,
        first_record_keys: first ? Object.keys(first) : [],
        first_position: first ? { kid: first.kid, x: first.position_x, y: first.position_y } : null,
        has_attack_metadata: first
          ? ["last_attack", "player_id", "player_name", "total_attack_count"].some(key => key in first)
          : false
      });
    } catch (error) { log({ probe: "dungeons", server, error: String(error) }); }
  }

  for (const server of ["E4K_PL1", "E4K_PL1_BETA", "IT1"]) {
    try {
      const { response, body } = await get(base + "/dungeons/meta", serverHeader(server));
      log({
        probe: "dungeons-meta", server, http_status: response.status,
        error: body?.error ?? null, last_scan_at: body?.last_scan_at ?? null
      });
    } catch (error) { log({ probe: "dungeons-meta", server, error: String(error) }); }
  }

  try {
    const url = base + "/dungeons?page=1&size=4000&filterByKid=" + encodeURIComponent("[1,2,3]");
    const { response, body } = await get(url, serverHeader("E4K_PL1_BETA"), 30_000);
    const dungeons = Array.isArray(body?.dungeons) ? body.dungeons : [];
    const map = JSON.parse(await readFile(new URL("../data/baron-fortresses.json", import.meta.url), "utf8"));
    const known = new Set();
    for (const data of Object.values(map.results || {})) {
      for (const f of data.fortresses || []) known.add([Number(f.kid), Number(f.x), Number(f.y)].join("/"));
    }
    const byKid = {};
    for (const dungeon of dungeons) {
      const kid = Number(dungeon.kid);
      const key = [kid, Number(dungeon.position_x), Number(dungeon.position_y)].join("/");
      const row = byKid[kid] ||= { total: 0, overlap_with_it1: 0, with_last_attack: 0, with_player_id: 0 };
      row.total++;
      if (known.has(key)) row.overlap_with_it1++;
      if (dungeon.last_attack) row.with_last_attack++;
      if (dungeon.player_id !== null && dungeon.player_id !== undefined) row.with_player_id++;
    }
    log({
      probe: "beta-dungeon-coordinate-overlap", http_status: response.status,
      error: body?.error ?? null, pagination: body?.pagination ?? null, rows: dungeons.length,
      by_kingdom: byKid,
      note: "Beta data is diagnostic only and is never copied into production PL1 history."
    });
  } catch (error) { log({ probe: "beta-dungeon-coordinate-overlap", error: String(error) }); }
}

async function probeBridge() {
  try {
    const { response, body } = await get(bridgeBase + "/status");
    const connected = body && body[targetServer] === true;
    log({
      probe: "bridge-status", http_status: response.status, target_server: targetServer,
      target_connected: body ? (body[targetServer] ?? null) : null,
      known_server_count: body && typeof body === "object" ? Object.keys(body).length : null
    });
    if (!response.ok || !connected) {
      log({ probe: "bridge-map-commands", skipped: true, reason: "Target PL1 socket is not confirmed connected" });
      return;
    }

    for (const [command, params] of [["gam", { M: {} }], ["gam", { O: {} }]]) {
      try {
        const headers = encodeURIComponent(JSON.stringify(params).slice(1, -1));
        const url = bridgeBase + "/" + encodeURIComponent(targetServer) + "/" + command + "/" + headers;
        const { response: result, body: payload } = await get(url);
        const content = payload?.content ?? payload?.data ?? {};
        const wrappers = Array.isArray(content?.M) ? content.M : [];
        const movements = wrappers.map(item => item?.M ?? item).filter(Boolean);
        const targets = movements.map(m => ({
          kid: Number(m.KID), returning: Number(m.D) === 1, type: Number(m.T), area: m.TA
        })).filter(m => Array.isArray(m.area));
        const typeCounts = {};
        for (const movement of targets) {
          const type = String(movement.area[0]);
          typeCounts[type] = (typeCounts[type] || 0) + 1;
        }
        log({
          probe: "bridge-read-command", command, sent_header_keys: Object.keys(params),
          http_status: result.status, error: payload?.error ?? null, return_code: payload?.return_code ?? null,
          content_keys: content && typeof content === "object" ? Object.keys(content) : [],
          movement_count: wrappers.length, target_type_counts: typeCounts
        });
      } catch (error) { log({ probe: "bridge-read-command", command, error: String(error) }); }
    }

    const catalog = JSON.parse(await readFile(new URL("../data/baron-fortresses.json", import.meta.url), "utf8"));
    for (const [kingdom, group] of Object.entries(catalog.results || {})) {
      const fortress = group.fortresses?.[0];
      if (!fortress) continue;
      const x = Number(fortress.x), y = Number(fortress.y);
      const params = {
        KID: Number(fortress.kid), AX1: x, AY1: y,
        AX2: Math.min(1286, x + 1), AY2: Math.min(1286, y + 1)
      };
      try {
        const headers = encodeURIComponent(JSON.stringify(params).slice(1, -1));
        const url = bridgeBase + "/" + encodeURIComponent(targetServer) + "/gaa/" + headers;
        const { response: result, body: payload } = await get(url);
        const content = payload?.content ?? payload?.data ?? {};
        const mapRows = Array.isArray(content?.AI) ? content.AI : [];
        const dungeons = mapRows.filter(row => Array.isArray(row) && Number(row[0]) === 11);
        log({
          probe: "bridge-map-area", kingdom,
          sample_area: { kid: params.KID, x1: params.AX1, y1: params.AY1, x2: params.AX2, y2: params.AY2 },
          http_status: result.status, error: payload?.error ?? null, return_code: payload?.return_code ?? null,
          content_keys: content && typeof content === "object" ? Object.keys(content) : [],
          map_row_count: mapRows.length, dungeon_row_count: dungeons.length,
          rows_with_attacker_id: dungeons.filter(row => row[6] !== null && row[6] !== undefined).length,
          rows_with_remaining_cooldown: dungeons.filter(row => Number.isFinite(Number(row[5]))).length,
          sample_dungeon_positions: dungeons.slice(0, 5).map(row => ({
            x: Number(row[1]), y: Number(row[2]), fields: row.length
          }))
        });
      } catch (error) { log({ probe: "bridge-map-area", kingdom, error: String(error) }); }
    }
  } catch (error) { log({ probe: "bridge-status", error: String(error) }); }
}

await probeGgeTracker();
await probeBridge();
