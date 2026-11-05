export const DEFAULT_PL1_ZONE = 'EmpirefourkingdomsExGG_3';
export const EXPECTED_BOSS_DUNGEON_OWNER_BY_KID = Object.freeze({ 1: -230, 2: -231, 3: -232 });
export const MAP_SECTOR_SIZE = 100;

const KINGDOMS = Object.freeze({ sands: 1, ice: 2, fire: 3 });
const KINGDOM_NAME_BY_KID = Object.freeze({ 1: 'sands', 2: 'ice', 3: 'fire' });
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
    dungeon_level: Number.isInteger(row.dungeonLevel) ? row.dungeonLevel : null,
    defeater_player_id: Number.isInteger(row.defeaterPlayerId) && row.defeaterPlayerId > 0
      ? row.defeaterPlayerId
      : null,
    last_spy_at_utc: toIsoDate(row.lastSpyDate),
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
  const expectedOwner = EXPECTED_BOSS_DUNGEON_OWNER_BY_KID[target.kid];
  const validRows = exactRows.filter((row) =>
    row.areaType === 11 && row.kingdomId === target.kid && row.ownerInfo?.playerId === expectedOwner
  );
  let status = 'not_confirmed';
  if (validRows.length === 1) status = 'fortress_row_found';
  else if (validRows.length > 1) status = 'ambiguous_duplicate_rows';
  else if (exactRows.length > 0) status = 'coordinate_row_unverified';

  const observation = {
    target: {
      catalog_id_it1: target.id, kid: target.kid, kingdom: target.kingdom, x: target.x, y: target.y,
      expected_area_type: 11, expected_boss_dungeon_owner_id: expectedOwner,
    },
    sampled_at_utc: sampledAtIso,
    status,
    rows: exactRows.map((row) => serializeExactRow(row, sampledAtIso)),
    defeater_player_id: null,
    attack_time_utc: null,
    note: 'Target catalog rows are BossDungeonMapobject (areaType 11): the client maps data[5] to remaining cooldown, data[6] to defeaterPlayerId and data[7] to kingdomId. The player ID is target-specific, but the row has no exact attack timestamp. No time is inferred until PL1 live semantics are validated.',
  };
  if (validRows.length === 1) {
    const row = serializeExactRow(validRows[0], sampledAtIso);
    observation.owner_id = row.owner_id;
    observation.dungeon_level = row.dungeon_level;
    observation.defeater_player_id = row.defeater_player_id;
    observation.last_spy_at_utc = row.last_spy_at_utc;
    observation.cooldown_until_utc = row.cooldown_until_utc;
    observation.cooldown_remaining_seconds_at_sample = row.cooldown_remaining_seconds_at_sample;
    observation.cooldown_active = row.cooldown_until_utc === null
      ? null
      : Date.parse(row.cooldown_until_utc) > Date.parse(sampledAtIso);
  }
  return observation;
}

export function compareObservations(previous, current) {
  if (!previous || !current || previous.status !== 'fortress_row_found' || current.status !== 'fortress_row_found') return [];
  const signals = [];
  if (
    Number.isInteger(current.defeater_player_id) && current.defeater_player_id > 0 &&
    current.defeater_player_id !== previous.defeater_player_id
  ) {
    signals.push({
      kind: 'target_defeater_id_changed',
      metric: 'BossDungeonMapobject.defeaterPlayerId',
      player_id: current.defeater_player_id,
      classification: 'candidate_target_specific_player_change_not_yet_live_validated',
      interval_start_utc: previous.sampled_at_utc,
      interval_end_utc: current.sampled_at_utc,
      target: current.target,
    });
  }
  if (previous.cooldown_active === false && current.cooldown_active === true) {
    signals.push({
      kind: 'target_cooldown_started',
      metric: 'BossDungeonMapobject.attackCooldownEnd',
      player_id: current.defeater_player_id ?? null,
      classification: 'candidate_target_specific_cooldown_transition_not_yet_live_validated',
      interval_start_utc: previous.sampled_at_utc,
      interval_end_utc: current.sampled_at_utc,
      target: current.target,
    });
  }
  return signals;
}

export function stateKey(target) {
  return `${target.kid}:${target.x}:${target.y}`;
}


/**
 * Extract direct, account-mailbox evidence for an NPC boss-dungeon battle.
 * The report confirms target + attacker, but its delivery timestamp is not
 * the attack start time and mailbox coverage is limited to the logged-in account.
 */
export function extractNpcBattleReportEvidence(message, battleLog) {
  if (
    Number(message?.messageType) !== 6 ||
    Number(message?.areaType) !== 11 ||
    Number(message?.subType) !== 2
  ) return null;

  const kid = Number(message.kingdomId);
  const expectedOwner = EXPECTED_BOSS_DUNGEON_OWNER_BY_KID[kid];
  if (!Number.isInteger(expectedOwner) || Number(message.ownerId) !== expectedOwner) return null;

  const mapObject = battleLog?.mapobject;
  if (Number(mapObject?.areaType) !== 11 || Number(mapObject?.kingdomId) !== kid) return null;

  const rawX = mapObject?.position?.X;
  const rawY = mapObject?.position?.Y;
  if (rawX === null || rawX === undefined || rawY === null || rawY === undefined) return null;
  const x = Number(rawX);
  const y = Number(rawY);
  if (![x, y].every((value) => Number.isInteger(value) && value >= 0 && value <= 1286)) return null;

  const attackerId = Number(battleLog?.attacker?.playerId);
  const defenderId = Number(battleLog?.defender?.playerId);
  if (!Number.isSafeInteger(attackerId) || attackerId <= 0 || defenderId !== expectedOwner) return null;

  const messageId = Number(message.messageId);
  const battleLogId = Number(battleLog.battleLogId);
  return {
    evidence_kind: 'mailbox_npc_battle_report',
    classification: 'confirmed_battle_report_target_and_attacker',
    message_id: Number.isSafeInteger(messageId) ? messageId : null,
    battle_log_id: Number.isSafeInteger(battleLogId) ? battleLogId : null,
    target: {
      kid,
      kingdom: KINGDOM_NAME_BY_KID[kid],
      x,
      y,
      area_type: 11,
      owner_id: expectedOwner,
    },
    attacker_player_id: attackerId,
    outcome: typeof message.hasAttackerWon === 'boolean'
      ? (message.hasAttackerWon ? 'attacker_won' : 'attacker_lost')
      : null,
    report_received_at_utc: toIsoDate(message.deliveryTime),
    message_is_forwarded: Boolean(message.isForwarded),
    report_delivery_kind: message.isForwarded ? 'forwarded_to_this_account' : 'original_mailbox_entry',
    attack_time_utc: null,
    time_semantics: 'BasicMessage.deliveryTime is derived from mailbox message age; it is not the attack start time.',
    source_fields: [
      'message.messageType=6',
      'message.areaType=11',
      'message.subType=2',
      'message.kingdomId',
      'message.ownerId',
      'battleLog.mapobject.position',
      'battleLog.attacker.playerId',
      'battleLog.defender.playerId',
    ],
  };
}


/**
 * Extract a live outbound NPC attack movement whose exact target is a
 * BossDungeonMapobject (area type 11). This proves an in-flight attack
 * movement visible to the connected account, not a global server event.
 * PT is elapsed seconds at sample time; departure is therefore an estimate,
 * not a server-issued exact attack timestamp.
 */
export function extractOutboundBossDungeonMovementEvidence(movement, sampledAt = new Date().toISOString()) {
  if (!movement || typeof movement !== 'object') return null;

  const kid = Number(movement.KID);
  const expectedOwner = EXPECTED_BOSS_DUNGEON_OWNER_BY_KID[kid];
  const targetArea = movement.TA;
  if (
    Number(movement.T) !== 11 ||
    Number(movement.D) !== 0 ||
    !Number.isInteger(expectedOwner) ||
    !Array.isArray(targetArea) ||
    Number(targetArea[0]) !== 11 ||
    Number(targetArea[7]) !== kid ||
    Number(movement.TID) !== expectedOwner
  ) return null;

  const x = Number(targetArea[1]);
  const y = Number(targetArea[2]);
  const attackerId = Number(movement.SID);
  const movementId = Number(movement.MID);
  const elapsedSeconds = Number(movement.PT);
  const totalTravelSeconds = Number(movement.TT);
  if (
    ![x, y].every((value) => Number.isInteger(value) && value >= 0 && value <= 1286) ||
    !Number.isSafeInteger(attackerId) || attackerId <= 0 ||
    !Number.isSafeInteger(movementId) || movementId <= 0 ||
    !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 ||
    !Number.isFinite(totalTravelSeconds) || totalTravelSeconds <= elapsedSeconds
  ) return null;

  const sampledAtIso = toIsoDate(sampledAt);
  if (!sampledAtIso) throw new Error('Invalid movement sample timestamp.');
  const sampledAtMs = Date.parse(sampledAtIso);
  const sourceArea = Array.isArray(movement.SA) ? movement.SA : null;
  const sourceX = sourceArea ? Number(sourceArea[1]) : NaN;
  const sourceY = sourceArea ? Number(sourceArea[2]) : NaN;
  const departureAt = new Date(sampledAtMs - elapsedSeconds * 1000).toISOString();
  const estimatedArrivalAt = new Date(sampledAtMs + (totalTravelSeconds - elapsedSeconds) * 1000).toISOString();

  return {
    evidence_kind: 'live_outbound_npc_attack_movement',
    classification: 'confirmed_outbound_attack_movement_to_boss_dungeon',
    movement_id: movementId,
    movement_type: 11,
    attack_type: Number.isFinite(Number(movement.ATT)) ? Number(movement.ATT) : null,
    direction: 0,
    sampled_at_utc: sampledAtIso,
    movement_departure_estimate_utc: departureAt,
    estimated_arrival_at_utc: estimatedArrivalAt,
    elapsed_seconds_at_sample: elapsedSeconds,
    total_travel_seconds: totalTravelSeconds,
    target: {
      kid,
      kingdom: KINGDOM_NAME_BY_KID[kid],
      x,
      y,
      area_type: 11,
      owner_id: expectedOwner,
    },
    attacker_player_id: attackerId,
    source: sourceArea && [sourceX, sourceY].every(Number.isFinite)
      ? { area_type: Number(sourceArea[0]), x: sourceX, y: sourceY }
      : null,
    attack_time_utc: null,
    time_semantics: 'PT is elapsed travel time; departure is estimated from the local sample timestamp and is not an exact server-issued event time.',
    coverage: 'Only movements returned to the authenticated bridge session; not a global PL1 feed.',
  };
}
