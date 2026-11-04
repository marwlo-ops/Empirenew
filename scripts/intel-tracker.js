import fs from "node:fs/promises";
import { DEFAULT_SERVER } from "../api/e4k-client.js";

const files = {
  snapshots: new URL("../data/location-snapshots.json", import.meta.url),
  feed: new URL("../data/intel-feed.json", import.meta.url),
  activity: new URL("../data/player-activity.json", import.meta.url)
};
const now = new Date().toISOString();
const POWER_DROP_THRESHOLD = 500;
const MAX_EVENTS = 1000;
const KINGDOMS = new Set([0, 1, 2, 3, 4]);
const read = async (url, fallback) => {
  try { return JSON.parse(await fs.readFile(url, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
};
const write = async (url, value) => fs.writeFile(url, JSON.stringify(value, null, 2) + "\n");
const finite = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const valueFrom = (row, keys) => {
  for (const key of keys) if (finite(row?.[key])) return Number(row[key]);
  return null;
};
const normalizeMetric = row => ({
  power: valueFrom(row, ["power", "might", "strength", "MP", "POW", "MIGHT"]),
  loot: valueFrom(row, ["loot", "plunder", "loot_points", "LP", "LOOT", "PLUNDER"]),
  glory: valueFrom(row, ["glory", "fame", "glory_points", "GP", "GLORY", "FAME"]),
  honor: valueFrom(row, ["honor", "honour", "honor_points", "HP", "HONOR", "HONOUR"]),
  rank: valueFrom(row, ["rank", "alliance_rank", "RANK", "AR"])
});
function extractMetrics(member) {
  // Metric discovery is deliberately strict: only scalar fields with known names are accepted.
  const sources = [member?.stats, member?.ranking, member?.metrics, member?.raw, member];
  const result = { power: null, loot: null, glory: null, honor: null, rank: null };
  for (const source of sources) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    const normalized = normalizeMetric(source);
    for (const key of Object.keys(result)) if (result[key] === null && normalized[key] !== null) result[key] = normalized[key];
  }
  return result;
}
function validSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.alliances) || !snapshot.alliances.length) return false;
  let total = 0;
  for (const alliance of snapshot.alliances) {
    if (!Number.isInteger(Number(alliance.aid)) || !Array.isArray(alliance.members) || !alliance.members.length) return false;
    for (const member of alliance.members) {
      if (!Number.isInteger(Number(member.member_id)) || !member.name || !Array.isArray(member.ap) || !Array.isArray(member.vp)) return false;
      for (const p of [...member.ap, ...member.vp]) {
        if (![p.kingdom_code, p.object_id, p.x, p.y, p.type_code].every(finite) || !KINGDOMS.has(Number(p.kingdom_code))) return false;
      }
      total++;
    }
  }
  return total > 0;
}
function flatten(snapshot) {
  return snapshot.alliances.flatMap(alliance => alliance.members.map(member => ({
    player_id: Number(member.member_id), member_id: Number(member.member_id),
    player: String(member.name), alliance_id: Number(alliance.aid),
    alliance_name: String(alliance.name || "Nieznany sojusz"),
    metrics: extractMetrics(member)
  })));
}
function event(kind, current, previous, description, extra = {}) {
  return {
    id: [kind, current.player_id, now].join(":"),
    kind, detected_at: now, source: "ain-snapshot",
    player_id: current.player_id, member_id: current.player_id,
    player: current.player, alliance_id: current.alliance_id,
    alliance_name: current.alliance_name, description,
    ...(previous ? { previous_value: previous, current_value: extra.current_value } : {}),
    ...extra
  };
}
const snapshot = await read(files.snapshots, null);
if (!validSnapshot(snapshot)) throw new Error("Niepoprawny lub pusty location-snapshots.json — Intel nie nadpisze poprawnych danych.");
const previousFeed = await read(files.feed, { schema_version: 1, server: DEFAULT_SERVER, updated_at: null, events: [] });
const previousActivity = await read(files.activity, { schema_version: 1, server: DEFAULT_SERVER, updated_at: null, metrics_available: false, players: [] });
if (!Array.isArray(previousFeed.events) || !Array.isArray(previousActivity.players)) throw new Error("Uszkodzony plik Intel.");
const current = flatten(snapshot);
const previous = new Map(previousActivity.players.map(p => [Number(p.player_id), p]));
const events = [];
const players = current.map(player => {
  const old = previous.get(player.player_id);
  const metric = player.metrics;
  const oldMetric = old?.metrics || {};
  if (old) {
    if (old.player && old.player !== player.player) events.push(event("nick_changed", player, old.player, "Gracz zmienił nick.", { previous_nick: old.player, current_nick: player.player }));
    if (Number(old.alliance_id) !== player.alliance_id) {
      events.push(event("alliance_left", { ...old, player: player.player }, old.alliance_name, "Gracz opuścił poprzedni sojusz.", { previous_alliance: old.alliance_name, current_alliance: player.alliance_name }));
      events.push(event("alliance_joined", player, old.alliance_name, "Gracz dołączył do innego sojuszu.", { previous_alliance: old.alliance_name, current_alliance: player.alliance_name }));
    }
    if (oldMetric.rank !== null && metric.rank !== null && oldMetric.rank !== metric.rank) {
      events.push(event("rank_changed", player, oldMetric.rank, "Zmiana rangi w rankingu/sojuszu.", { current_value: metric.rank }));
    }
    if (oldMetric.power !== null && metric.power !== null) {
      const delta = metric.power - oldMetric.power;
      if (delta <= -POWER_DROP_THRESHOLD) events.push(event("power_drop", player, oldMetric.power, "Spadek punktów potęgi przekroczył próg 500 pkt.", { current_value: metric.power, delta, threshold: POWER_DROP_THRESHOLD, glory_delta: oldMetric.glory !== null && metric.glory !== null ? metric.glory - oldMetric.glory : null }));
      else if (delta >= POWER_DROP_THRESHOLD) events.push(event("power_gain", player, oldMetric.power, "Przyrost punktów potęgi przekroczył próg 500 pkt.", { current_value: metric.power, delta, threshold: POWER_DROP_THRESHOLD }));
    }
    if (oldMetric.loot !== null && metric.loot !== null && metric.loot > oldMetric.loot) {
      events.push(event("loot_activity", player, oldMetric.loot, "Wykryto przyrost punktów łupów.", { current_value: metric.loot, delta: metric.loot - oldMetric.loot }));
    }
  }
  const history = Array.isArray(old?.metric_history) ? old.metric_history.slice(-287) : [];
  const point = { captured_at: snapshot.captured_at || now, ...metric };
  if (!history.length || JSON.stringify(history[history.length - 1]) !== JSON.stringify(point)) history.push(point);
  const lootPoints = history.filter(p => p.loot !== null && p.loot !== undefined);
  const powerPoints = history.filter(p => p.power !== null && p.power !== undefined);
  const oneHourAgo = Date.now() - 3600000, sixHoursAgo = Date.now() - 21600000, twelveHoursAgo = Date.now() - 43200000, dayAgo = Date.now() - 86400000;
  const loot1h = lootPoints.filter(p => Date.parse(p.captured_at) >= oneHourAgo);
  const loot6h = lootPoints.filter(p => Date.parse(p.captured_at) >= sixHoursAgo);
  const loot12h = lootPoints.filter(p => Date.parse(p.captured_at) >= twelveHoursAgo);
  const power24h = powerPoints.filter(p => Date.parse(p.captured_at) >= dayAgo);
  const delta = points => points.length >= 2 ? points[points.length - 1].loot - points[0].loot : null;
  const powerDelta = power24h.length >= 2 ? power24h[power24h.length - 1].power - power24h[0].power : null;
  const lastLootAt = lootPoints.length ? lootPoints[lootPoints.length - 1].captured_at : null;
  const d1 = delta(loot1h), d6 = delta(loot6h), d12 = delta(loot12h);
  let status = "unknown", statusLabel = "Brak danych rankingu łupów";
  if (d1 !== null && d1 > 0) { status = "high"; statusLabel = "Wysoka aktywność / farmuje"; }
  else if (d6 !== null && d6 > 0) { status = "medium"; statusLabel = "Średnia aktywność"; }
  else if (lastLootAt && Date.now() - Date.parse(lastLootAt) >= 43200000 && loot12h.length >= 2 && d12 === 0) { status = "low"; statusLabel = "Inaktywny (brak przyrostu > 12h)"; }
  return {
    player_id: player.player_id, member_id: player.member_id, player: player.player,
    alliance_id: player.alliance_id, alliance_name: player.alliance_name,
    metrics: metric, metrics_available: Object.values(metric).some(v => v !== null),
    last_seen: snapshot.captured_at || now, last_loot_at: lastLootAt,
    loot_delta_1h: d1, loot_delta_6h: d6, loot_delta_12h: d12,
    power_delta_24h: powerDelta, status, status_label: statusLabel,
    metric_history: history
  };
});
const knownIds = new Set(current.map(p => p.player_id));
const metricsAvailable = players.some(p => p.metrics_available);
const merged = [...events, ...previousFeed.events].sort((a, b) => String(b.detected_at).localeCompare(String(a.detected_at))).slice(0, MAX_EVENTS);
await write(files.feed, { schema_version: 1, server: DEFAULT_SERVER, updated_at: now, source_snapshot_at: snapshot.captured_at, event_count: merged.length, events: merged });
await write(files.activity, { schema_version: 1, server: DEFAULT_SERVER, updated_at: now, source_snapshot_at: snapshot.captured_at, metrics_available: metricsAvailable, metric_fields_detected: [...new Set(players.flatMap(p => Object.entries(p.metrics).filter(([,v]) => v !== null).map(([k]) => k)))], player_count: players.length, players });
console.log(JSON.stringify({ ok: true, updated_at: now, players: players.length, new_events: events.length, feed_events: merged.length, metrics_available: metricsAvailable, metric_fields_detected: [...new Set(players.flatMap(p => Object.entries(p.metrics).filter(([,v]) => v !== null).map(([k]) => k)))] }));
