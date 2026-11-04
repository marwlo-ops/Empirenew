import fs from "node:fs/promises";
import { fetchServerPlayerRanking, DEFAULT_SERVER } from "../api/e4k-client.js";

const snapshotPath = new URL("../data/server-intel-snapshot.json", import.meta.url);
const historyPath = new URL("../data/server-intel-history.json", import.meta.url);
const now = new Date().toISOString();
const MAX_EVENTS = 20000;
const POWER_DELTA_THRESHOLD = 500;
const hasNumber = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const read = async (url, fallback) => {
  try { return JSON.parse(await fs.readFile(url, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
};
const write = async (url, value) => fs.writeFile(url, JSON.stringify(value, null, 2) + "\n");
const fail = message => { console.error("SERVER INTEL FAIL-SAFE:", message); process.exit(1); };
const oldSnapshot = await read(snapshotPath, null);
const oldHistory = await read(historyPath, { schema_version: 1, server: DEFAULT_SERVER, updated_at: null, events: [], players: [] });
if (!Array.isArray(oldHistory.events) || !Array.isArray(oldHistory.players)) fail("server-intel-history.json ma niepoprawną strukturę.");

let snapshot;
try {
  snapshot = await fetchServerPlayerRanking({ limit: 1000 }, { server: DEFAULT_SERVER });
} catch (error) {
  console.error("SERVER INTEL API DIAGNOSTICS:", JSON.stringify({
    message: error.message,
    name: error.name,
    details: error.details || null,
    stack: error.stack
  }, null, 2));
  fail("Nie udało się pobrać rankingu graczy; poprzedni snapshot i historia pozostają bez zmian.");
}
if (snapshot.complete !== true || snapshot.ranking_validated !== true) fail("Ranking nie przeszedł walidacji kompletności; pliki nie zostaną nadpisane.");
if (!Number.isInteger(snapshot.total_count) || snapshot.player_count !== snapshot.total_count) fail(`Niezgodność liczby profili i LR: ${snapshot.player_count}/${snapshot.total_count}; pliki nie zostaną nadpisane.`);
if (snapshot.player_count < 50) fail(`Ranking zwrócił podejrzanie mało graczy: ${snapshot.player_count}; pliki nie zostaną nadpisane.`);
// A trusted baseline must come from a previous full hgh harvest, never from the RB/MD map seed.
const hasTrustedBaseline = oldSnapshot?.source === "hgh" && oldSnapshot?.player_count >= 50 && Boolean(oldSnapshot?.baseline_established_at);
const isBaseline = !hasTrustedBaseline;
snapshot.baseline_established_at = isBaseline ? snapshot.captured_at : oldSnapshot.baseline_established_at;
snapshot.snapshot_sequence = isBaseline ? 1 : Number(oldSnapshot.snapshot_sequence || 1) + 1;
if (oldSnapshot?.players?.length && snapshot.player_count < Math.floor(oldSnapshot.players.length * 0.7)) {
  fail(`Podejrzany spadek liczby graczy: ${oldSnapshot.players.length} → ${snapshot.player_count}; zachowuję poprzedni snapshot.`);
}
const previous = new Map((isBaseline ? [] : (oldSnapshot?.players || [])).map(p => [String(p.player_id), p]));
const events = [];
const players = snapshot.players.map(player => {
  const old = previous.get(String(player.player_id));
  if (old) {
    if (old.name && old.name !== player.name) events.push({
      kind: "nick_changed", player_id: player.player_id, player: player.name,
      alliance_id: player.alliance_id, alliance_name: player.alliance_name,
      previous_nick: old.name, current_nick: player.name,
      description: `Zmiana nicku: ${old.name} → ${player.name}`
    });
    if (Number(old.alliance_id) !== player.alliance_id || old.alliance_name !== player.alliance_name) events.push({
      kind: "alliance_changed", player_id: player.player_id, player: player.name,
      previous_alliance_id: old.alliance_id, previous_alliance: old.alliance_name,
      current_alliance_id: player.alliance_id, current_alliance: player.alliance_name,
      description: `Zmiana sojuszu: ${old.alliance_name || "Brak"} → ${player.alliance_name || "Brak"}`
    });
    if (hasNumber(old.power) && hasNumber(player.power)) {
      const delta = player.power - old.power;
      if (Math.abs(delta) >= POWER_DELTA_THRESHOLD) events.push({
        kind: delta > 0 ? "power_gain" : "power_drop", player_id: player.player_id,
        player: player.name, alliance_id: player.alliance_id, alliance_name: player.alliance_name,
        previous_value: Number(old.power), current_value: player.power, delta,
        description: `${delta > 0 ? "Przyrost" : "Spadek"} potęgi o ${Math.abs(delta).toLocaleString("pl-PL")} pkt.`
      });
    }
    if (hasNumber(old.loot) && hasNumber(player.loot)) {
      const delta = player.loot - old.loot;
      if (delta !== 0) events.push({
        kind: "loot_delta", player_id: player.player_id, player: player.name,
        alliance_id: player.alliance_id, alliance_name: player.alliance_name,
        previous_value: Number(old.loot), current_value: player.loot, delta,
        description: `Zmiana punktów łupów: ${delta > 0 ? "+" : ""}${delta.toLocaleString("pl-PL")}`
      });
    }
    const oldHonor = old.honor_points ?? old.raw?.H ?? null;
    const currentHonor = player.honor_points ?? player.raw?.H ?? null;
    if (hasNumber(oldHonor) && hasNumber(currentHonor)) {
      const delta = Number(currentHonor) - Number(oldHonor);
      if (delta !== 0) events.push({
        kind: "honor_delta", player_id: player.player_id, player: player.name,
        alliance_id: player.alliance_id, alliance_name: player.alliance_name,
        previous_value: Number(oldHonor), current_value: Number(currentHonor), delta,
        description: `Zmiana honoru: ${delta > 0 ? "+" : ""}${delta.toLocaleString("pl-PL")} pkt.`
      });
    }
  }
  const metricHistory = isBaseline ? [] : (Array.isArray(old?.metric_history) ? old.metric_history.slice(-288) : []);
  const point = { captured_at: snapshot.captured_at, power: player.power, loot: player.loot, honor_points: player.honor_points ?? player.raw?.H ?? null, rank: player.rank };
  const last = metricHistory.at(-1);
  if (!last || last.captured_at !== point.captured_at) metricHistory.push(point);
  const last24 = metricHistory.filter(p => Date.parse(p.captured_at) >= Date.now() - 86400000);
  const first = last24[0], end = last24.at(-1);
  const powerDelta24h = first && end && hasNumber(first.power) && hasNumber(end.power) ? Number(end.power) - Number(first.power) : null;
  const honorDelta24h = first && end && hasNumber(first.honor_points) && hasNumber(end.honor_points) ? Number(end.honor_points) - Number(first.honor_points) : null;
  const lootDelta24h = first && end && hasNumber(first.loot) && hasNumber(end.loot) ? Number(end.loot) - Number(first.loot) : null;
  return {
    ...player, metrics_available: player.power !== null || player.loot !== null || player.glory_points !== null || player.honor_points !== null,
    power_delta_24h: powerDelta24h, loot_delta_24h: lootDelta24h, honor_delta_24h: honorDelta24h,
    trend_available: metricHistory.length >= 2,
    activity_status: metricHistory.length >= 2 && ((powerDelta24h !== null && powerDelta24h !== 0) || (honorDelta24h !== null && honorDelta24h !== 0)) ? "active" : "unknown",
    activity_label: metricHistory.length < 2 ? "Zbieranie historii" : (honorDelta24h !== null && honorDelta24h !== 0 ? "Zmiana honoru w ostatnich 24 h" : (powerDelta24h !== null && powerDelta24h !== 0 ? "Zmiana potęgi w ostatnich 24 h" : "Brak wykrytej zmiany w ostatnich 24 h")),
    last_seen: snapshot.captured_at, metric_history: metricHistory
  };
});
const stamped = events.map((event, index) => ({
  id: [event.kind, event.player_id, snapshot.captured_at, index].join(":"),
  detected_at: snapshot.captured_at, source: "hgh", server: DEFAULT_SERVER, ...event
}));
const merged = [...stamped, ...oldHistory.events]
  .sort((a, b) => String(b.detected_at).localeCompare(String(a.detected_at)))
  .slice(0, MAX_EVENTS);
const allianceMap = new Map();
for (const player of players) {
  const aid = Number(player.alliance_id || 0);
  const key = String(aid);
  if (!allianceMap.has(key)) allianceMap.set(key, { alliance_id: aid, name: player.alliance_name || (aid ? `Sojusz #${aid}` : "Brak sojuszu"), member_count: 0, total_power: 0, power_known_count: 0, active_count: 0, activity_known_count: 0 });
  const alliance = allianceMap.get(key);
  alliance.member_count += 1;
  if (hasNumber(player.power)) { alliance.total_power += Number(player.power); alliance.power_known_count += 1; }
  if (player.activity_status === "active") alliance.active_count += 1;
  if (player.trend_available) alliance.activity_known_count += 1;
}
const history = {
  schema_version: 2, server: DEFAULT_SERVER, updated_at: now,
  baseline_only: isBaseline, baseline_established_at: snapshot.baseline_established_at,
  snapshot_sequence: snapshot.snapshot_sequence,
  trends_available: !isBaseline && snapshot.snapshot_sequence >= 2,
  alliances: [...allianceMap.values()].sort((a, b) => b.total_power - a.total_power),
  source_snapshot_at: snapshot.captured_at, player_count: players.length,
  metrics_available: !isBaseline && snapshot.snapshot_sequence >= 2 && players.some(p => p.metrics_available),
  metric_fields_detected: ["power", "loot", "honor_points"].filter(k => players.some(p => p[k] !== null)),
  event_count: merged.length, new_events: stamped.length, events: merged, players
};
// Atomic-ish order: history first, then snapshot. A failed history write leaves previous snapshot in place.
await write(historyPath, history);
await write(snapshotPath, snapshot);
console.log(JSON.stringify({
  ok: true, server: DEFAULT_SERVER, players: snapshot.player_count,
  total_count: snapshot.total_count, pages_fetched: snapshot.pages_fetched,
  new_events: stamped.length, total_events: merged.length, baseline_only: isBaseline,
  snapshot_sequence: snapshot.snapshot_sequence, alliance_count: allianceMap.size,
  metrics_available: history.metrics_available, metric_fields_detected: history.metric_fields_detected
}));
