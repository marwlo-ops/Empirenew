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

async function probeBetaPlayerHistoryFromDungeonRows() {
  try {
    const map = JSON.parse(await readFile(new URL("../data/baron-fortresses.json", import.meta.url), "utf8"));
    const known = new Set();
    for (const data of Object.values(map.results || {})) {
      for (const f of data.fortresses || []) known.add(Number(f.kid) + "/" + Number(f.x) + "/" + Number(f.y));
    }
    const response = await fetch(
      base + "/dungeons?page=1&size=4000&filterByKid=" + encodeURIComponent("[1,2,3]"),
      {
        headers: { "gge-server": "E4K_PL1_BETA", Accept: "application/json" },
        signal: AbortSignal.timeout(30000)
      }
    );
    const body = await response.json();
    const dungeons = Array.isArray(body.dungeons) ? body.dungeons : [];
    if (!response.ok) {
      console.log(JSON.stringify({
        probe: "beta-player-history-from-dungeons",
        api_server: "E4K_PL1_BETA",
        dungeons_status: response.status,
        error: body.error ?? null
      }));
      return;
    }

    const ids = [...new Set(dungeons
      .map(d => d.player_id)
      .filter(id => id !== null && id !== undefined)
      .map(String))].slice(0, 5);
    const samples = [];
    for (const playerId of ids) {
      const historyResponse = await fetch(
        base + "/dungeons/player/" + encodeURIComponent(playerId) + "?lastDays=365",
        {
          headers: { "gge-server": "E4K_PL1_BETA", Accept: "application/json" },
          signal: AbortSignal.timeout(20000)
        }
      );
      const history = await historyResponse.json();
      const rows = Array.isArray(history.dungeons) ? history.dungeons : [];
      const targetRows = rows.filter(d =>
        known.has(Number(d.kid) + "/" + Number(d.position_x) + "/" + Number(d.position_y))
      );
      samples.push({
        history_status: historyResponse.status,
        records: rows.length,
        target_matches: targetRows.length,
        includes_a_source_dungeon: rows.some(d =>
          dungeons.some(source =>
            String(source.player_id) === playerId &&
            Number(source.kid) === Number(d.kid) &&
            Number(source.position_x) === Number(d.position_x) &&
            Number(source.position_y) === Number(d.position_y)
          )
        )
      });
    }

    console.log(JSON.stringify({
      probe: "beta-player-history-from-dungeons",
      api_server: "E4K_PL1_BETA",
      dungeons_status: response.status,
      dungeon_rows: dungeons.length,
      rows_with_player_id: dungeons.filter(d => d.player_id !== null && d.player_id !== undefined).length,
      unique_player_ids_sampled: ids.length,
      histories_checked: samples.length,
      nonempty_histories: samples.filter(x => x.records > 0).length,
      total_history_records: samples.reduce((n, x) => n + x.records, 0),
      total_target_matches: samples.reduce((n, x) => n + x.target_matches, 0),
      samples,
      note: "Beta-only endpoint diagnostic. Never use these rows as production PL1 attack evidence."
    }));
  } catch (error) {
    console.log(JSON.stringify({ probe: "beta-player-history-from-dungeons", error: String(error) }));
  }
}

async function probeProductionPlayerHistoryFromSpySnapshot() {
  try {
    const snapshot = JSON.parse(await readFile(new URL("../data/location-snapshots.json", import.meta.url), "utf8"));
    const map = JSON.parse(await readFile(new URL("../data/baron-fortresses.json", import.meta.url), "utf8"));
    const known = new Set();
    for (const data of Object.values(map.results || {})) {
      for (const f of data.fortresses || []) known.add(Number(f.kid) + "/" + Number(f.x) + "/" + Number(f.y));
    }
    const members = (snapshot.alliances || []).flatMap(a => a.members || [])
      .filter(m => m.name && m.member_id != null)
      .slice(0, 3);
    const results = [];
    for (const member of members) {
      let playerId = String(member.member_id);
      let lookupStatus = null;
      let lookupError = null;
      try {
        const lookup = await fetch(base + "/players/" + encodeURIComponent(member.name), {
          headers: { "gge-server": "E4K_PL1", Accept: "application/json" },
          signal: AbortSignal.timeout(20000)
        });
        const player = await lookup.json();
        lookupStatus = lookup.status;
        lookupError = player.error ?? null;
        if (lookup.ok && player.player_id != null) playerId = String(player.player_id);
      } catch (error) {
        lookupError = String(error);
      }

      try {
        const historyResponse = await fetch(
          base + "/dungeons/player/" + encodeURIComponent(playerId) + "?lastDays=365",
          {
            headers: { "gge-server": "E4K_PL1", Accept: "application/json" },
            signal: AbortSignal.timeout(20000)
          }
        );
        const history = await historyResponse.json();
        const rows = Array.isArray(history.dungeons) ? history.dungeons : [];
        const targetRows = rows.filter(d =>
          known.has(Number(d.kid) + "/" + Number(d.position_x) + "/" + Number(d.position_y))
        );
        results.push({
          lookup_status: lookupStatus,
          lookup_resolved: lookupStatus === 200 && lookupError === null,
          lookup_error: lookupError,
          history_status: historyResponse.status,
          history_error: history.error ?? null,
          records: rows.length,
          target_matches: targetRows.length,
          sample_target_events: targetRows.slice(0, 5).map(d => ({
            kid: Number(d.kid),
            x: Number(d.position_x),
            y: Number(d.position_y),
            attacked_at: d.attacked_at
          }))
        });
      } catch (error) {
        results.push({
          lookup_status: lookupStatus,
          lookup_resolved: lookupStatus === 200 && lookupError === null,
          lookup_error: lookupError,
          history_error: String(error)
        });
      }
    }
    console.log(JSON.stringify({
      probe: "production-pl1-player-history-from-spy-snapshot",
      api_server: "E4K_PL1",
      snapshot_members_sampled: members.length,
      histories_checked: results.length,
      nonempty_histories: results.filter(x => Number(x.records) > 0).length,
      total_history_records: results.reduce((n, x) => n + Number(x.records || 0), 0),
      total_target_matches: results.reduce((n, x) => n + Number(x.target_matches || 0), 0),
      results,
      note: "Only E4K_PL1 responses count as production evidence; no Beta or IT1 cooldown is reused."
    }));
  } catch (error) {
    console.log(JSON.stringify({ probe: "production-pl1-player-history-from-spy-snapshot", error: String(error) }));
  }
}

async function probeProductionPlayerHistoryWithZoneIdSuffix() {
  try {
    const snapshot = JSON.parse(await readFile(new URL("../data/location-snapshots.json", import.meta.url), "utf8"));
    const network = JSON.parse(await readFile(new URL("./barony-live/node_modules/e4k-data/network/network.json", import.meta.url), "utf8"));
    const pl1 = network.instances.find(item => item.zone === "EmpirefourkingdomsExGG_3");
    if (!pl1 || !Number.isInteger(pl1.zoneId)) {
      console.log(JSON.stringify({
        probe: "production-pl1-player-history-with-zone-id-suffix",
        skipped: true,
        reason: "Pinned e4k-data has no numeric zoneId for production PL1"
      }));
      return;
    }
    const members = (snapshot.alliances || []).flatMap(a => a.members || [])
      .filter(m => Number.isInteger(m.member_id) && m.member_id > 999)
      .slice(0, 3);
    const results = [];
    for (const member of members) {
      const candidateId = String(member.member_id) + String(pl1.zoneId).padStart(3, "0");
      try {
        const response = await fetch(
          base + "/dungeons/player/" + encodeURIComponent(candidateId) + "?lastDays=365",
          { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) }
        );
        const body = await response.json();
        const rows = Array.isArray(body.dungeons) ? body.dungeons : [];
        results.push({
          http_status: response.status,
          error: body.error ?? null,
          records: rows.length,
          target_matches: rows.filter(d =>
            Number.isInteger(Number(d.kid)) &&
            Number.isInteger(Number(d.position_x)) &&
            Number.isInteger(Number(d.position_y))
          ).length
        });
      } catch (error) {
        results.push({ error: String(error) });
      }
    }
    console.log(JSON.stringify({
      probe: "production-pl1-player-history-with-zone-id-suffix",
      api_route: "/dungeons/player/{playerId}",
      suffix_source: "pinned e4k-data production PL1 zoneId",
      candidate_suffix: pl1.zoneId,
      snapshot_members_sampled: members.length,
      histories_checked: results.length,
      http_200: results.filter(x => x.http_status === 200).length,
      nonempty_histories: results.filter(x => Number(x.records) > 0).length,
      total_history_records: results.reduce((n, x) => n + Number(x.records || 0), 0),
      results,
      note: "Appending zoneId to a raw map member ID is only a routing hypothesis. Count records only as production PL1 if the suffix resolves to the PL1 database and the returned player identity is independently matched; this probe does not persist events."
    }));
  } catch (error) {
    console.log(JSON.stringify({ probe: "production-pl1-player-history-with-zone-id-suffix", error: String(error) }));
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

await probeBetaPlayerHistoryFromDungeonRows();
await probeProductionPlayerHistoryFromSpySnapshot();
await probeProductionPlayerHistoryWithZoneIdSuffix();
await probeBridge();
