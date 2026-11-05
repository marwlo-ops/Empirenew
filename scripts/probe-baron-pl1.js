import { readFile } from "node:fs/promises";
// Read-only probes only; do not persist player names or inferred attack events.
const base = "https://api.gge-tracker.com/api/v1";
const bridgeBase = "https://empire-api.fly.dev";
const targetServer = "EmpirefourkingdomsExGG2_3";

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

try {
  const url = base + "/dungeons?page=1&size=4000&filterByKid=" + encodeURIComponent("[1,2,3]");
  const response = await fetch(url, {
    headers: { "gge-server": "E4K_PL1_BETA", Accept: "application/json" },
    signal: AbortSignal.timeout(30000)
  });
  const body = await response.json();
  const dungeons = Array.isArray(body.dungeons) ? body.dungeons : [];
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

async function probePlayerRosterOverlap() {
  try {
    const snapshot = JSON.parse(await readFile(new URL("../data/location-snapshots.json", import.meta.url), "utf8"));
    const map = JSON.parse(await readFile(new URL("../data/baron-fortresses.json", import.meta.url), "utf8"));
    const memberNames = new Set((snapshot.alliances || []).flatMap(a => a.members || [])
      .map(m => String(m.name || "").trim().toLowerCase()).filter(Boolean));
    const known = new Set();
    for (const data of Object.values(map.results || {})) {
      for (const f of data.fortresses || []) known.add(Number(f.kid) + "/" + Number(f.x) + "/" + Number(f.y));
    }
    const apiPlayers = [];
    let totalPlayers = null;
    for (let page = 1; page <= 2; page++) {
      const response = await fetch(base + "/players?page=" + page + "&size=100", {
        headers: { "gge-server": "E4K_PL1_BETA", Accept: "application/json" },
        signal: AbortSignal.timeout(20000)
      });
      const body = await response.json();
      if (!response.ok) {
        console.log(JSON.stringify({
          probe: "player-roster-overlap",
          api_server: "E4K_PL1_BETA",
          http_status: response.status,
          error: body.error ?? null
        }));
        return;
      }
      totalPlayers = body.pagination?.total_items_count ?? totalPlayers;
      apiPlayers.push(...(Array.isArray(body.players) ? body.players : []));
      if (apiPlayers.length >= Number(totalPlayers || 0)) break;
    }
    const matches = apiPlayers.filter(p => memberNames.has(String(p.player_name || "").trim().toLowerCase()));
    const historySamples = [];
    for (const player of matches.slice(0, 5)) {
      const response = await fetch(base + "/dungeons/player/" + encodeURIComponent(player.player_id) + "?lastDays=365", {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20000)
      });
      const body = await response.json();
      const rows = Array.isArray(body.dungeons) ? body.dungeons : [];
      historySamples.push({
        history_status: response.status,
        records: rows.length,
        target_matches: rows.filter(d => known.has(Number(d.kid) + "/" + Number(d.position_x) + "/" + Number(d.position_y))).length,
        sample: rows.slice(0, 5).map(d => ({
          kid: Number(d.kid), x: Number(d.position_x), y: Number(d.position_y),
          attacked_at: d.attacked_at,
          matches_it1_fortress: known.has(Number(d.kid) + "/" + Number(d.position_x) + "/" + Number(d.position_y))
        }))
      });
    }
    console.log(JSON.stringify({
      probe: "player-roster-overlap",
      api_server: "E4K_PL1_BETA",
      api_players_fetched: apiPlayers.length,
      api_total_players: totalPlayers,
      snapshot_member_count: memberNames.size,
      name_overlap_count: matches.length,
      histories_checked: historySamples.length,
      histories: historySamples
    }));
  } catch (error) {
    console.log(JSON.stringify({ probe: "player-roster-overlap", error: String(error) }));
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
      known_server_count: status && typeof status === "object" ? Object.keys(status).length : null
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
      ["gam", { O: {} }],
      ["gaa", { KID: 1 }]
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
        const baronTargets = targetRows.filter(m => Number(m.area[0]) === 2 && !m.returning)
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
          outbound_baron_target_count: baronTargets.length,
          outbound_baron_targets: baronTargets.slice(0, 25),
          map_row_count: mapRows.length
        }));
      } catch (error) {
        console.log(JSON.stringify({ probe: "bridge-read-command", command, error: String(error) }));
      }
    }
  } catch (error) {
    console.log(JSON.stringify({ probe: "bridge-status", error: String(error) }));
  }
}

await probePlayerRosterOverlap();
await probeBridge();
