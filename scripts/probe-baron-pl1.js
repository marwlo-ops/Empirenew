import { readFile } from "node:fs/promises";
// Read-only probes only; do not persist player names or inferred attack events.
const base = "https://api.gge-tracker.com/api/v1";
const bridgeBase = "https://empire-api.fly.dev";
const targetServer = "EmpirefourkingdomsExGG2_3";
let betaDungeonRows = [];

const serverListResponse = await fetch(base + "/servers", {
  headers: { Accept: "application/json" },
  signal: AbortSignal.timeout(20000)
});
const serverList = await serverListResponse.json();
const serverListText = JSON.stringify(serverList || []).toUpperCase();
const serverCandidates = (Array.isArray(serverList) ? serverList : [])
  .filter(item => JSON.stringify(item).toUpperCase().includes("E4K_PL1"))
  .slice(0, 10)
  .map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).filter(([key, value]) =>
      /server|code|name|id|country|region/i.test(key) && (typeof value !== "object" || value === null)
    ));
  });
console.log(JSON.stringify({
  probe: "server-list",
  status: serverListResponse.status,
  entry_count: Array.isArray(serverList) ? serverList.length : null,
  mentions_e4k_pl1_token: serverListText.includes("E4K_PL1"),
  mentions_e4k_pl1_beta: serverListText.includes("E4K_PL1_BETA"),
  candidate_entries: serverCandidates
}));

try {
  const catalogResponse = await fetch(base + "/servers/catalog", {
    headers: { Accept: "application/xml, text/xml, */*" },
    signal: AbortSignal.timeout(20000)
  });
  const xml = await catalogResponse.text();
  const blocks = xml.match(/<server>[\s\S]*?<\/server>/g) || [];
  const entries = {};
  for (const alias of ["E4K_PL1", "E4K_PL1_BETA"]) {
    const block = blocks.find(item => new RegExp("<name>\\s*" + alias + "\\s*</name>").test(item));
    const field = name => {
      const match = block?.match(new RegExp("<" + name + ">([\\s\\S]*?)</" + name + ">"));
      return match ? match[1].trim() : null;
    };
    entries[alias] = block ? {
      name: field("name"),
      gge_server_name: field("gge-server-name"),
      zone: field("zone"),
      zone_id: field("zone-id"),
      code: field("code"),
      enabled: field("enabled"),
      fortress: field("fortress")
    } : null;
  }
  console.log(JSON.stringify({
    probe: "server-catalog",
    http_status: catalogResponse.status,
    content_type: catalogResponse.headers.get("content-type"),
    bytes: xml.length,
    server_entries: entries,
    contains_target_zone: xml.includes("EmpirefourkingdomsExGG2_3")
  }));
} catch (error) {
  console.log(JSON.stringify({ probe: "server-catalog", error: String(error) }));
}

for (const server of [targetServer, "E4K_PL1", "E4K_PL1_BETA", "PL1", "IT1"]) {
  try {
    const url = base + "/dungeons?page=1&size=1&filterByKid=" + encodeURIComponent("[1,2,3]");
    const response = await fetch(url, {
      headers: { "gge-server": server, Accept: "application/json" },
      signal: AbortSignal.timeout(20000)
    });
    const body = await response.json();
    const rows = Array.isArray(body.dungeons) ? body.dungeons : null;
    const first = rows?.[0] ?? null;
    const attackFieldsPresent = first
      ? ["last_attack", "last_attacker_id", "player_id", "player_name",
         "global_available_at", "effective_cooldown_until"].some(key => key in first)
      : false;
    console.log(JSON.stringify({
      probe: "dungeons",
      server,
      http_status: response.status,
      error: body.error ?? null,
      count_in_sample: rows?.length ?? null,
      pagination: body.pagination ?? null,
      first_record_keys: first ? Object.keys(first) : [],
      first_position: first ? { kid: first.kid, x: first.position_x, y: first.position_y } : null,
      has_attack_metadata_in_source: attackFieldsPresent
    }));
  } catch (error) {
    console.log(JSON.stringify({ probe: "dungeons", server, error: String(error) }));
  }
}

for (const server of ["E4K_PL1", "E4K_PL1_BETA", "IT1"]) {
  try {
    const response = await fetch(base + "/dungeons/meta", {
      headers: { "gge-server": server, Accept: "application/json" },
      signal: AbortSignal.timeout(20000)
    });
    const body = await response.json();
    console.log(JSON.stringify({
      probe: "dungeons-meta",
      server,
      http_status: response.status,
      error: body.error ?? null,
      last_scan_at: body.last_scan_at ?? null
    }));
  } catch (error) {
    console.log(JSON.stringify({ probe: "dungeons-meta", server, error: String(error) }));
  }
}

try {
  const url = base + "/dungeons?page=1&size=4000&filterByKid=" + encodeURIComponent("[1,2,3]");
  const response = await fetch(url, {
    headers: { "gge-server": "E4K_PL1_BETA", Accept: "application/json" },
    signal: AbortSignal.timeout(30000)
  });
  const body = await response.json();
  const dungeons = Array.isArray(body.dungeons) ? body.dungeons : [];
  betaDungeonRows = dungeons;
  const map = JSON.parse(await readFile(new URL("../data/baron-fortresses.json", import.meta.url), "utf8"));
  const known = new Map();
  for (const data of Object.values(map.results || {})) {
    for (const f of data.fortresses || []) known.set(Number(f.kid) + "/" + Number(f.x) + "/" + Number(f.y), true);
  }
  const byKid = {};
  for (const d of dungeons) {
    const kid = Number(d.kid);
    const key = kid + "/" + Number(d.position_x) + "/" + Number(d.position_y);
    const row = byKid[kid] ||= { total: 0, overlap_with_it1: 0, with_last_attack: 0, with_player_id: 0 };
    row.total++;
    if (known.has(key)) row.overlap_with_it1++;
    if (d.last_attack) row.with_last_attack++;
    if (d.player_id !== null && d.player_id !== undefined) row.with_player_id++;
  }
  console.log(JSON.stringify({
    probe: "beta-dungeon-coordinate-overlap",
    http_status: response.status,
    error: body.error ?? null,
    pagination: body.pagination ?? null,
    rows: dungeons.length,
    by_kingdom: byKid,
    note: "E4K_PL1_BETA is a separate beta identifier; overlap does not establish production PL1 equivalence."
  }));
} catch (error) {
  console.log(JSON.stringify({ probe: "beta-dungeon-coordinate-overlap", error: String(error) }));
}

async function probeBetaPlayerHistory() {
  try {
    const map = JSON.parse(await readFile(new URL("../data/baron-fortresses.json", import.meta.url), "utf8"));
    const known = new Set();
    for (const data of Object.values(map.results || {})) {
      for (const f of data.fortresses || []) known.add(Number(f.kid) + "/" + Number(f.x) + "/" + Number(f.y));
    }
    // Sample player IDs that actually appear as last attackers in Beta dungeon rows,
    // not arbitrary high-ranked players who may never have attacked a dungeon.
    const playerIds = [...new Set(betaDungeonRows
      .map(row => row.player_id)
      .filter(id => id !== null && id !== undefined && String(id).trim() !== "")
      .map(String))].slice(0, 5);
    const historySamples = [];
    for (const playerId of playerIds) {
      const response = await fetch(base + "/dungeons/player/" + encodeURIComponent(playerId) + "?lastDays=365", {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20000)
      });
      const body = await response.json();
      const rows = Array.isArray(body.dungeons) ? body.dungeons : [];
      const targetRows = rows.filter(d =>
        known.has(Number(d.kid) + "/" + Number(d.position_x) + "/" + Number(d.position_y))
      );
      historySamples.push({
        history_status: response.status,
        records: rows.length,
        target_matches: targetRows.length,
        sample_target_events: targetRows.slice(0, 5).map(d => ({
          kid: Number(d.kid), x: Number(d.position_x), y: Number(d.position_y),
          attacked_at: d.attacked_at
        }))
      });
    }
    console.log(JSON.stringify({
      probe: "beta-player-history",
      api_server: "E4K_PL1_BETA",
      beta_dungeon_rows: betaDungeonRows.length,
      distinct_attacker_ids_sampled: playerIds.length,
      histories_checked: historySamples.length,
      histories: historySamples,
      note: "Beta-only diagnostic. IDs are sampled from Beta dungeon rows; this is not production PL1 attack evidence."
    }));
  } catch (error) {
    console.log(JSON.stringify({ probe: "beta-player-history", error: String(error) }));
  }
}

async function probeBridge() {
  try {
    const response = await fetch(bridgeBase + "/status", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20000)
    });
    const raw = await response.text();
    let status;
    try { status = JSON.parse(raw); } catch { status = null; }
    const connected = status && status[targetServer] === true;
    console.log(JSON.stringify({
      probe: "bridge-status",
      http_status: response.status,
      target_server: targetServer,
      target_connected: status ? (status[targetServer] ?? null) : null,
      known_server_count: status && typeof status === "object" ? Object.keys(status).length : null,
      matching_aliases: status && typeof status === "object" ? Object.keys(status).filter(key => /PL1|Poland|ExGG2_3/i.test(key)) : []
    }));
    if (!response.ok || !connected) {
      console.log(JSON.stringify({
        probe: "bridge-map-commands",
        skipped: true,
        reason: "Target PL1 socket is not confirmed connected"
      }));
      return;
    }

    const commands = [
      ["gam", { M: {} }],
      ["gam", { O: {} }]
    ];
    for (const [command, params] of commands) {
      try {
        const headers = encodeURIComponent(JSON.stringify(params).slice(1, -1));
        const url = bridgeBase + "/" + encodeURIComponent(targetServer) + "/" + command + "/" + headers;
        const result = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(20000)
        });
        const raw = await result.text();
        let body;
        try { body = JSON.parse(raw); } catch { body = { raw: raw.slice(0, 300) }; }
        const content = body?.content ?? body?.data ?? {};
        const wrappers = Array.isArray(content?.M) ? content.M : [];
        const movements = wrappers.map(item => item?.M ?? item).filter(Boolean);
        const targetRows = movements.map(m => ({ kid: Number(m.KID), movement_id: Number(m.MID),
          returning: Number(m.D) === 1, type: Number(m.T), area: m.TA }))
          .filter(m => Array.isArray(m.area));
        const dungeonTargetCandidates = targetRows.filter(m => Number(m.area[0]) === 2 && !m.returning)
          .map(m => ({ kid: m.kid, x: Number(m.area[1]), y: Number(m.area[2]), movement_type: m.type }));
        const typeCounts = {};
        for (const m of targetRows) typeCounts[String(m.area[0])] = (typeCounts[String(m.area[0])] || 0) + 1;
        const mapRows = Array.isArray(content?.AI) ? content.AI : [];
        console.log(JSON.stringify({
          probe: "bridge-read-command",
          command,
          sent_header_keys: Object.keys(params),
          http_status: result.status,
          error: body?.error ?? null,
          return_code: body?.return_code ?? null,
          content_keys: content && typeof content === "object" ? Object.keys(content) : [],
          movement_count: wrappers.length,
          movement_target_type_counts: typeCounts,
          outbound_dungeon_target_candidate_count: dungeonTargetCandidates.length,
          outbound_dungeon_target_candidates: dungeonTargetCandidates.slice(0, 25),
          map_row_count: mapRows.length,
          scope_note: "Movement data visible to the connected bridge account only; not server-wide."
        }));
      } catch (error) {
        console.log(JSON.stringify({ probe: "bridge-read-command", command, error: String(error) }));
      }
    }

    // Read a tiny 2x2 map area around one known IT1 coordinate in each kingdom.
    // Do not assume row[0] or row[6] semantics until a real PL1 response confirms them.
    const catalog = JSON.parse(await readFile(new URL("../data/baron-fortresses.json", import.meta.url), "utf8"));
    for (const [kingdom, group] of Object.entries(catalog.results || {})) {
      const fortress = group.fortresses?.[0];
      if (!fortress) continue;
      const x = Number(fortress.x);
      const y = Number(fortress.y);
      const params = {
        KID: Number(fortress.kid),
        AX1: x,
        AY1: y,
        AX2: Math.min(1286, x + 1),
        AY2: Math.min(1286, y + 1)
      };
      try {
        const headers = encodeURIComponent(JSON.stringify(params).slice(1, -1));
        const url = bridgeBase + "/" + encodeURIComponent(targetServer) + "/gaa/" + headers;
        const result = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(20000)
        });
        const raw = await result.text();
        let body;
        try { body = JSON.parse(raw); } catch { body = { raw: raw.slice(0, 300) }; }
        const content = body?.content ?? body?.data ?? {};
        const rows = Array.isArray(content?.AI) ? content.AI : [];
        const typeCounts = {};
        for (const row of rows) {
          const type = String(row?.[0] ?? "unknown");
          typeCounts[type] = (typeCounts[type] || 0) + 1;
        }
        const samples = rows.slice(0, 5).map(row => ({
          object_type: row?.[0] ?? null,
          x: Number(row?.[1]),
          y: Number(row?.[2]),
          field_count: Array.isArray(row) ? row.length : null,
          field5_numeric: row?.[5] !== null && row?.[5] !== undefined && Number.isFinite(Number(row[5])),
          field6_present: row?.[6] !== null && row?.[6] !== undefined,
          field6_type: typeof row?.[6]
        }));
        console.log(JSON.stringify({
          probe: "bridge-map-area",
          kingdom,
          sample_area: { kid: params.KID, x1: params.AX1, y1: params.AY1, x2: params.AX2, y2: params.AY2 },
          http_status: result.status,
          error: body?.error ?? null,
          return_code: body?.return_code ?? null,
          content_keys: content && typeof content === "object" ? Object.keys(content) : [],
          map_row_count: rows.length,
          object_type_counts: typeCounts,
          sample_rows: samples
        }));
      } catch (error) {
        console.log(JSON.stringify({ probe: "bridge-map-area", kingdom, error: String(error) }));
      }
    }
  } catch (error) {
    console.log(JSON.stringify({ probe: "bridge-status", error: String(error) }));
  }
}

await probeBetaPlayerHistory();
await probeBridge();
