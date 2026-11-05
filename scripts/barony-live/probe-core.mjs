export const DEFAULT_PL1_ZONE = 'EmpirefourkingdomsExGG_3';
export const EXPECTED_OWNER_BY_KID = Object.freeze({ 1: -220, 2: -221, 3: -222 });
export const MAP_SECTOR_SIZE = 100;

const KINGDOMS = Object.freeze({ sands: 1, ice: 2, fire: 3 });
const FORBIDDEN_CATALOG_KEY = /(attack|cooldown|player|defeater|ready|attacked)/i;

export function validateMapOnlyCatalog(payload) {
  if (!payload || payload.complete !== true || payload.server_source !== 'IT1') {
    throw new Error('Expected a complete IT1 map-only catalog.');
  }
  if (!payload.results || typeof payload.results !== 'object') throw new Error('Catalog has no results object.');
  const seen = new Set();
  const groups = {};
  let total = 0;
  for (const [kingdom, kid] of Object.entries(KINGDOMS)) {
    const group = payload.results[kingdom];
    if (!group || group.complete !== true || !Array.isArray(group.fortresses)) throw new Error(`Missing or incomplete kingdom ${kingdom}.`);
    if (group.fortress_count !== group.fortresses.length) throw new Error(`Invalid fortress count for ${kingdom}.`);
    groups[kingdom] = group.fortresses.map((point) => {
      if (!point || typeof point !== 'object' || Array.isArray(point)) throw new Error(`Invalid record in ${kingdom}.`);
      if (Object.keys(point).some((key) => FORBIDDEN_CATALOG_KEY.test(key))) throw new Error('IT1 catalog contains attack/player state; refusing to use it.');
      if (point.kid !== kid || point.kingdom !== kingdom || point.source_server !== 'IT1' || point.type !== 'dungeon') throw new Error(`Kingdom/source/type mismatch in ${kingdom}.`);
      if (![point.x, point.y].every((v) => Number.isInteger(v) && v >= 0 && v <= 1286)) throw new Error(`Invalid coordinate in ${kingdom}.`);
      const key = `${kid}:${point.x}:${point.y}`;
      if (seen.has(key)) throw new Error(`Duplicate coordinate ${key}.`);
      seen.add(key);
      return { ...point };
    });
    total += groups[kingdom].length;
  }
  if (total !== payload.total_count) throw new Error(`Catalog total mismatch: ${total} != ${payload.total_count}.`);
  return groups;
}

export function pickSamples(points, count = 3) {
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error('samples-per-kingdom must be an integer from 1 to 10.');
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y || String(a.id).localeCompare(String(b.id)));
  if (sorted.length <= count) return sorted;
  if (count === 1) return [sorted[Math.floor(sorted.length / 2)]];
  return Array.from({ length: count }, (_, i) => sorted[Math.floor(i * (sorted.length - 1) / (count - 1) + 0.5)]);
}

export function buildScanPlan(payload, { all = false, samplesPerKingdom = 3 } = {}) {
  const groups = validateMapOnlyCatalog(payload);
  const targets = Object.entries(groups).flatMap(([kingdom, points]) =>
    (all ? points : pickSamples(points, samplesPerKingdom)).map((point) => ({
      id: point.id, kid: point.kid, kingdom, x: point.x, y: point.y,
      coordinate_source: 'GGE Tracker IT1 map only; coordinate alignment supplied by operator',
    }))
  );
  const sectorMap = new Map();
  for (const target of targets) {
    const sx = Math.floor(target.x / MAP_SECTOR_SIZE);
    const sy = Math.floor(target.y / MAP_SECTOR_SIZE);
    const key = `${target.kid}:${sx}:${sy}`;
    if (!sectorMap.has(key)) sectorMap.set(key, {
      key, kid: target.kid, kingdom: target.kingdom, sector_x: sx, sector_y: sy,
      center_x: sx * MAP_SECTOR_SIZE + 50, center_y: sy * MAP_SECTOR_SIZE + 50, targets: [],
    });
    sectorMap.get(key).targets.push(target);
  }
  const sectors = [...sectorMap.values()].sort((a, b) => a.kid - b.kid || a.sector_x - b.sector_x || a.sector_y - b.sector_y);
  return {
    targets, sectors,
    summary: {
      target_count: targets.length, sector_count: sectors.length,
      estimated_map_tiles: sectors.length * MAP_SECTOR_SIZE * MAP_SECTOR_SIZE,
      sector_size: '100x100',
    },
  };
}

function toIsoDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  return null;
}

function serializeExactRow(row, sampledAt) {
  const cooldownUntil = toIsoDate(row.attackCooldownEnd);
  const sampledAtMs = Date.parse(sampledAt);
  const cooldownMs = cooldownUntil && Number.isFinite(sampledAtMs)
    ? Date.parse(cooldownUntil) - sampledAtMs
    : null;
  return {
    area_type: Number.isInteger(row.areaType) ? row.areaType : null,
    kingdom_id: Number.isInteger(row.kingdomId) ? row.kingdomId : null,
    owner_id: Number.isInteger(row.ownerInfo?.playerId) ? row.ownerInfo.playerId : null,
    attack_count: Number.isInteger(row.attackCount) ? row.attackCount : null,
    cooldown_until_utc: cooldownUntil,
    cooldown_remaining_seconds_at_sample: cooldownMs === null ? null : Math.max(0, Math.ceil(cooldownMs / 1000)),
  };
}

export function buildObservation(target, mapObjects, sampledAt = new Date().toISOString()) {
  const sampledAtIso = toIsoDate(sampledAt);
  if (!sampledAtIso) throw new Error('Invalid observation timestamp.');
  const exactRows = (Array.isArray(mapObjects) ? mapObjects : []).filter((row) =>
    row?.position?.X === target.x && row?.position?.Y === target.y
  );
  const expectedOwner = EXPECTED_OWNER_BY_KID[target.kid];
  const validRows = exactRows.filter((row) =>
    row.areaType === 2 && row.kingdomId === target.kid && row.ownerInfo?.playerId === expectedOwner
  );
  let status = 'not_confirmed';
  if (validRows.length === 1) status = 'fortress_row_found';
  else if (validRows.length > 1) status = 'ambiguous_duplicate_rows';
  else if (exactRows.length > 0) status = 'coordinate_row_unverified';

  const observation = {
    target: { catalog_id_it1: target.id, kid: target.kid, kingdom: target.kingdom, x: target.x, y: target.y, expected_npc_owner_id: expectedOwner },
    sampled_at_utc: sampledAtIso, status,
    rows: exactRows.map((row) => serializeExactRow(row, sampledAtIso)),
    attack_time_utc: null,
    note: 'Map observation only. No exact attack timestamp or attacker is inferred.',
  };
  if (validRows.length === 1) {
    const row = serializeExactRow(validRows[0], sampledAt);
    observation.owner_id = row.owner_id;
    observation.attack_count = row.attack_count;
    observation.cooldown_until_utc = row.cooldown_until_utc;
    observation.cooldown_active = row.cooldown_until_utc === null
      ? null
      : Date.parse(row.cooldown_until_utc) > Date.parse(sampledAtIso);
  }
  return observation;
}

export function compareObservations(previous, current) {
  if (!previous || !current || previous.status !== 'fortress_row_found' || current.status !== 'fortress_row_found') return [];
  const signals = [];
  if (Number.isInteger(previous.attack_count) && Number.isInteger(current.attack_count) && current.attack_count > previous.attack_count) {
    signals.push({
      kind: 'attack_count_increased', classification: 'candidate_signal_not_yet_live_validated',
      delta: current.attack_count - previous.attack_count,
      interval_start_utc: previous.sampled_at_utc, interval_end_utc: current.sampled_at_utc, target: current.target,
    });
  }
  if (previous.cooldown_active === false && current.cooldown_active === true) {
    signals.push({
      kind: 'target_cooldown_started', classification: 'candidate_signal_not_yet_live_validated',
      interval_start_utc: previous.sampled_at_utc, interval_end_utc: current.sampled_at_utc, target: current.target,
    });
  }
  return signals;
}

export function stateKey(target) {
  return `${target.kid}:${target.x}:${target.y}`;
}
