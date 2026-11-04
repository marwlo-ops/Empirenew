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

const snapshot = await fetchServerPlayerRanking({ limit: 1000, pageSize: 100, maxPages: 10 }, { server: DEFAULT_SERVER });
if (snapshot.player_count < 50) fail(`Ranking zwrócił podejrzanie mało graczy: ${snapshot.player_count}; pliki nie zostaną nadpisane.`);
if (oldSnapshot?.players?.length && snapshot.player_count < Math.floor(oldSnapshot.players.length * 0.7)) {
  fail(`Podejrzany spadek liczby graczy: ${oldSnapshot.players.length} → ${snapshot.player_count}; zachowuję poprzedni snapshot.`);
}
const previous = new Map((oldSnapshot?.players || []).map(p => [String(p.player_id), p]));
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
    if (hasNumber(old.glory_points) && hasNumber(player.glory_points)) {
      const delta = player.glory_points - old.glory_points;
      if (delta !== 0) events.push({
        kind: "glory_delta", player_id: player.player_id, player: player.name,
        alliance_id: player.alliance_id, alliance_name: player.alliance_name,
        previous_value: Number(old.glory_points), current_value: player.glory_points, delta,
        description: `Zmiana punktów chwały: ${delta > 0 ? "+" : ""}${delta.toLocaleString("pl-PL")}`
      });
    }
  }
  const metricHistory = Array.isArray(old?.metric_history) ? old.metric_history.slice(-287) : [];
  const point = { captured_at: snapshot.captured_at, power: player.power, loot: player.loot, glory_points: player.glory_points, rank: player.rank };
  const last = metricHistory.at(-1);
  if (!last || ["power", "loot", "glory_points", "rank"].some(k => last[k] !== point[k])) metricHistory.push(point);
  const last24 = metricHistory.filter(p => Date.parse(p.captured_at) >= Date.now() - 86400000);
  const first = last24[0], end = last24.at(-1);
  const powerDelta24h = first && end && hasNumber(first.power) && hasNumber(end.power) ? Number(end.power) - Number(first.power) : null;
  const lootDelta24h = first && end && hasNumber(first.loot) && hasNumber(end.loot) ? Number(end.loot) - Number(first.loot) : null;
  return {
    ...player, metrics_available: player.power !== null || player.loot !== null || player.glory_points !== null,
    power_delta_24h: powerDelta24h, loot_delta_24h: lootDelta24h,
    activity_status: powerDelta24h !== null && powerDelta24h !== 0 ? "active" : "unknown",
    activity_label: powerDelta24h !== null && powerDelta24h !== 0 ? "Zmiana potęgi w ostatnich 24 h" : "Brak wystarczających danych aktywności",
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
const history = {
  schema_version: 1, server: DEFAULT_SERVER, updated_at: now,
  source_snapshot_at: snapshot.captured_at, player_count: players.length,
  metrics_available: players.some(p => p.metrics_available),
  metric_fields_detected: ["power", "loot", "glory_points"].filter(k => players.some(p => p[k] !== null)),
  event_count: merged.length, new_events: stamped.length, events: merged, players
};
// Atomic-ish order: history first, then snapshot. A failed history write leaves previous snapshot in place.
await write(historyPath, history);
await write(snapshotPath, snapshot);
console.log(JSON.stringify({
  ok: true, server: DEFAULT_SERVER, players: snapshot.player_count,
  total_count: snapshot.total_count, pages_fetched: snapshot.pages_fetched,
  new_events: stamped.length, total_events: merged.length,
  metrics_available: history.metrics_available, metric_fields_detected: history.metric_fields_detected
}));
