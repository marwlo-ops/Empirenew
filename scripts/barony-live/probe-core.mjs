export const DEFAULT_PL1_ZONE = 'EmpirefourkingdomsExGG_3';
export const EXPECTED_BOSS_DUNGEON_OWNER_BY_KID = Object.freeze({ 1: -230, 2: -231, 3: -232 });
export const MAP_SECTOR_SIZE = 100;

const KINGDOMS = Object.freeze({ sands: 1, ice: 2, fire: 3 });
const KINGDOM_NAME_BY_KID = Object.freeze({ 1: 'sands', 2: 'ice', 3: 'fire' });
const FORBIDDEN_CATALOG_KEY = /(attack|cooldown|player|defeater|ready|attacked)/i;
const ALLOWED_FORTRESS_KEYS = new Set(['id', 'kid', 'kingdom', 'x', 'y', 'type', 'source_server']);

export function validateMapOnlyCatalog(payload) {
  if (!payload || payload.complete !== true || payload.server_source !== 'IT1') {
    throw new Error('Expected a complete IT1 map-only catalog.');
  }
  if (!payload.results || typeof payload.results !== 'object') throw new Error('Catalog has no results object.');
  const seen = new Set();
  const seenIds = new Set();
  const groups = {};
  let total = 0;
  for (const [kingdom, kid] of Object.entries(KINGDOMS)) {
    const group = payload.results[kingdom];
    if (!group || group.complete !== true || !Array.isArray(group.fortresses)) throw new Error(`Missing or incomplete kingdom ${kingdom}.`);
    if (group.fortress_count !== group.fortresses.length) throw new Error(`Invalid fortress count for ${kingdom}.`);
    groups[kingdom] = group.fortresses.map((point) => {
      if (!point || typeof point !== 'object' || Array.isArray(point)) throw new Error(`Invalid record in ${kingdom}.`);
      if (Object.keys(point).some((key) => FORBIDDEN_CATALOG_KEY.test(key))) throw new Error('IT1 catalog contains attack/player state; refusing to use it.');
      if (typeof point.id !== 'string' || point.id.trim().length === 0) throw new Error(`Invalid fortress ID in ${kingdom}.`);
      const pointKeys = Object.keys(point);
      if (pointKeys.length !== ALLOWED_FORTRESS_KEYS.size || pointKeys.some((key) => !ALLOWED_FORTRESS_KEYS.has(key))) {
        throw new Error('Unexpected or missing map-only fortress fields; refusing to use catalog.');
      }
      if (seenIds.has(point.id)) throw new Error(`Duplicate fortress ID ${point.id}.`);
      seenIds.add(point.id);
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
export function isNpcBattleReportMessage(message) {
  if (Number(message?.messageType) !== 6 || Number(message?.areaType) !== 11) return false;
  const metadataPrefix = typeof message?.metadata === 'string'
    ? message.metadata.split('#')[0].split('+')
    : [];
  const metadataSubtype = metadataPrefix.length > 1 ? Number(metadataPrefix[1]) : NaN;
  const subtype = Number.isInteger(metadataSubtype) ? metadataSubtype : Number(message?.subType);
  return subtype === 2;
}

/**
 * Select the newest account-mailbox NPC boss-dungeon reports.
 * ggejs may leave subType at 0 while encoding the real subtype in metadata.
 * Invalid/missing delivery timestamps sort last and remain explicitly estimates.
 */
export function selectLatestNpcBattleReportMessages(messages, limit = 25) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('NPC report limit must be an integer from 1 to 100.');
  }
  if (!Array.isArray(messages)) return [];
  return messages
    .map((message, index) => ({
      message,
      index,
      deliveryTime: toIsoDate(message?.deliveryTime),
    }))
    .filter(({ message }) => isNpcBattleReportMessage(message))
    .sort((left, right) => {
      const leftTime = left.deliveryTime ? Date.parse(left.deliveryTime) : 0;
      const rightTime = right.deliveryTime ? Date.parse(right.deliveryTime) : 0;
      return rightTime - leftTime || left.index - right.index;
    })
    .slice(0, limit)
    .map(({ message }) => message);
}

export function extractNpcBattleReportEvidence(
  message,
  battleLog,
  shortLogTimeEvidence = null,
  middleLogTimeEvidence = null,
) {
  if (!isNpcBattleReportMessage(message)) return null;

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
  const expectedTarget = { area_type: 11, kid, x, y };
  const targetFields = ['area_type', 'kid', 'x', 'y'];
  const targetMatches = (candidate) => {
    const target = candidate?.target;
    if (!target) return true;
    return targetFields.every((key) =>
      target[key] === null || target[key] === undefined || Number(target[key]) === expectedTarget[key]
    );
  };
  const validateTimeCandidate = (candidate, command, source) => {
    const candidateMessageId = Number(candidate?.message_id);
    const candidateBattleLogId = Number(candidate?.battle_log_id);
    const rawSecondsSinceBattle = candidate?.seconds_since_battle;
    // Candidates come from the validated wire parsers; do not coerce booleans or arrays here.
    const secondsSinceBattle = typeof rawSecondsSinceBattle === 'number' ? rawSecondsSinceBattle : NaN;
    const receivedAt = toIsoDate(candidate?.received_at_utc);
    const battleTime = toIsoDate(candidate?.battle_time_estimate_utc);
    if (
      candidate?.command !== command ||
      candidate?.ok !== true ||
      candidate?.source !== source ||
      !Number.isSafeInteger(messageId) || messageId <= 0 ||
      candidateMessageId !== messageId ||
      !Number.isSafeInteger(battleLogId) || battleLogId <= 0 ||
      candidateBattleLogId !== battleLogId ||
      !Number.isFinite(secondsSinceBattle) || secondsSinceBattle <= 0 ||
      !receivedAt || !battleTime ||
      toIsoDate(Date.parse(receivedAt) - secondsSinceBattle * 1000) !== battleTime ||
      !targetMatches(candidate)
    ) return null;
    if (
      command === 'blm' &&
      !['active_mailbox_report_fetch', 'BLM.MID'].includes(candidate?.message_id_source)
    ) return null;
    return {
      ...candidate,
      seconds_since_battle: secondsSinceBattle,
      received_at_utc: receivedAt,
      battle_time_estimate_utc: battleTime,
    };
  };

  const shortIdsMatch = Number(shortLogTimeEvidence?.message_id) === messageId &&
    Number(shortLogTimeEvidence?.battle_log_id) === battleLogId;
  const shortTarget = shortLogTimeEvidence?.target;
  const shortHasTarget = shortTarget && targetFields.some((key) =>
    shortTarget[key] !== null && shortTarget[key] !== undefined
  );
  const shortTargetConflict = shortIdsMatch && shortHasTarget && !targetMatches(shortLogTimeEvidence);
  const blsCandidate = validateTimeCandidate(shortLogTimeEvidence, 'bls', 'BLS.PS');
  const blmCandidate = validateTimeCandidate(middleLogTimeEvidence, 'blm', 'BLM.PS');

  let selectedTime = null;
  let secondaryTime = null;
  let battleTimeSource = null;
  let crosscheckDeltaSeconds = null;
  let battleTimeRejectionReason = null;
  if (shortTargetConflict) {
    battleTimeRejectionReason = 'BLS.AI target disagreed with the full battle-log target; timestamp withheld.';
  } else if (blsCandidate && blmCandidate) {
    crosscheckDeltaSeconds = Math.abs(
      Date.parse(blsCandidate.battle_time_estimate_utc) -
      Date.parse(blmCandidate.battle_time_estimate_utc)
    ) / 1000;
    if (crosscheckDeltaSeconds <= 15) {
      selectedTime = blsCandidate;
      secondaryTime = blmCandidate;
      battleTimeSource = 'BLS.PS+BLM.PS_cross_checked';
    } else {
      battleTimeRejectionReason = 'BLS.PS and BLM.PS estimates differed by more than 15 seconds; timestamp withheld.';
    }
  } else if (blsCandidate) {
    selectedTime = blsCandidate;
    battleTimeSource = 'BLS.PS_seconds_since_battle';
  } else if (blmCandidate && !shortTargetConflict) {
    selectedTime = blmCandidate;
    battleTimeSource = 'BLM.PS_seconds_since_battle';
  }

  const hasBattleTimeEstimate = Boolean(selectedTime);
  const reportDeliveryTime = toIsoDate(message.deliveryTime);
  let timeSemantics = 'BasicMessage.deliveryTime is estimated from mailbox message age against the local clock; it is not an exact server receipt time or attack start time. No BLS.PS or BLM.PS value passed correlation and consistency checks.';
  if (hasBattleTimeEstimate && secondaryTime) {
    timeSemantics = 'BLS.PS and BLM.PS both report seconds since battle and were correlated to this mailbox MID, battle-log LID and full type-11 target. Their local-receipt-based estimates agree within 15 seconds. This estimates battle occurrence, not attack launch; network transit and local/server clock skew remain.';
  } else if (hasBattleTimeEstimate && selectedTime.command === 'bls') {
    timeSemantics = 'BLS.PS is the server-reported seconds since battle. Subtracting it from the local BLS response-receipt time estimates when the battle occurred; this is not the attack launch time, and uncertainty includes network transit and local/server clock skew.';
  } else if (hasBattleTimeEstimate && selectedTime.command === 'blm') {
    timeSemantics = 'BLM.PS is the server-reported seconds since battle. Its LID matches the full battle log and its MID is bound to the active getBattleLog() mailbox request (or present in the BLM payload); the full type-11 target and participants were independently validated. This is a battle-occurrence estimate, not attack launch time.';
  }

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
    attacker_player_name: typeof battleLog?.attacker?.ownerInfo?.playerName === 'string' && battleLog.attacker.ownerInfo.playerName.trim()
      ? battleLog.attacker.ownerInfo.playerName.trim()
      : null,
    outcome: typeof message.hasAttackerWon === 'boolean'
      ? (message.hasAttackerWon ? 'attacker_won' : 'attacker_lost')
      : null,
    report_delivery_time_estimate_utc: reportDeliveryTime,
    battle_time_estimate_utc: hasBattleTimeEstimate ? selectedTime.battle_time_estimate_utc : null,
    battle_time_seconds_since_battle: hasBattleTimeEstimate ? selectedTime.seconds_since_battle : null,
    battle_time_secondary_seconds_since_battle: secondaryTime ? secondaryTime.seconds_since_battle : null,
    battle_time_observed_at_utc: hasBattleTimeEstimate ? selectedTime.received_at_utc : null,
    battle_time_source: hasBattleTimeEstimate ? battleTimeSource : null,
    battle_time_crosscheck_delta_seconds: crosscheckDeltaSeconds === null ? null : Number(crosscheckDeltaSeconds.toFixed(3)),
    battle_time_rejection_reason: battleTimeRejectionReason,
    message_is_forwarded: Boolean(message.isForwarded),
    report_delivery_kind: message.isForwarded ? 'forwarded_to_this_account' : 'original_mailbox_entry',
    attack_time_utc: null,
    time_semantics: timeSemantics,
    source_fields: [
      'message.messageType=6',
      'message.areaType=11',
      'message.metadata (areaType+subType+result)',
      'message.kingdomId',
      'message.ownerId',
      'battleLog.mapobject.position',
      'battleLog.attacker.playerId',
      'battleLog.attacker.ownerInfo.playerName',
      'battleLog.defender.playerId',
      ...(hasBattleTimeEstimate
        ? [
            selectedTime.command.toUpperCase() + '.PS (seconds_since_battle)',
            selectedTime.command === 'bls' ? 'BLS.MID' :
              (selectedTime.message_id_source === 'BLM.MID' ? 'BLM.MID/LID' : 'BLM.LID + active mailbox report MID'),
            ...(selectedTime.command === 'bls' ? ['BLS.LID', 'BLS.AI target coordinates'] : []),
            ...(secondaryTime ? ['BLM.PS cross-check', 'BLS.PS/BLM.PS estimate agreement <= 15 seconds'] : []),
          ]
        : []),
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
    classification: 'observed_outbound_npc_attack_movement_to_boss_dungeon',
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
    attacker_player_name: typeof sourceArea?.ownerInfo?.playerName === 'string' && sourceArea.ownerInfo.playerName.trim()
      ? sourceArea.ownerInfo.playerName.trim()
      : null,
    source: sourceArea && [sourceX, sourceY].every(Number.isFinite)
      ? { area_type: Number(sourceArea[0]), x: sourceX, y: sourceY }
      : null,
    attack_time_utc: null,
    time_semantics: 'PT is elapsed travel time; departure is estimated from the local sample timestamp and is not an exact server-issued event time.',
    coverage: 'Only movements returned to the authenticated bridge session; not a global PL1 feed.',
  };
}


/**
 * Normalize a ggejs MovementManager object for a live outbound NPC attack
 * to a BossDungeonMapobject. ggejs derives departure/arrival from PT/TT
 * against the local parse clock; these remain estimates, not server event time.
 */
export function extractParsedOutboundBossDungeonMovementEvidence(movement, sampledAt = new Date().toISOString()) {
  if (!movement || typeof movement !== 'object') return null;

  const kid = Number(movement.kingdomId);
  const expectedOwner = EXPECTED_BOSS_DUNGEON_OWNER_BY_KID[kid];
  const targetArea = movement.targetArea;
  const sourceArea = movement.sourceArea;
  if (
    Number(movement.movementType) !== 11 ||
    Number(movement.direction) !== 0 ||
    !Number.isInteger(expectedOwner) ||
    Number(targetArea?.areaType) !== 11 ||
    Number(targetArea?.kingdomId) !== kid ||
    Number(targetArea?.ownerInfo?.playerId) !== expectedOwner
  ) return null;

  const x = Number(targetArea?.position?.X);
  const y = Number(targetArea?.position?.Y);
  const attackerId = Number(sourceArea?.ownerInfo?.playerId);
  const movementId = Number(movement.movementId);
  const departureAt = toIsoDate(movement.departureTime);
  const arrivalAt = toIsoDate(movement.arrivalTime);
  const sampledAtIso = toIsoDate(sampledAt);
  if (!sampledAtIso) throw new Error('Invalid parsed movement sample timestamp.');
  const sampledAtMs = Date.parse(sampledAtIso);

  if (
    ![x, y].every((value) => Number.isInteger(value) && value >= 0 && value <= 1286) ||
    !Number.isSafeInteger(attackerId) || attackerId <= 0 ||
    !Number.isSafeInteger(movementId) || movementId <= 0 ||
    !departureAt || !arrivalAt ||
    Date.parse(departureAt) > sampledAtMs ||
    Date.parse(arrivalAt) <= sampledAtMs
  ) return null;

  const sourceX = Number(sourceArea?.position?.X);
  const sourceY = Number(sourceArea?.position?.Y);
  return {
    evidence_kind: 'live_outbound_npc_attack_movement',
    classification: 'observed_outbound_npc_attack_movement_to_boss_dungeon',
    movement_id: movementId,
    movement_type: 11,
    attack_type: Number.isFinite(Number(movement.attackType)) ? Number(movement.attackType) : null,
    direction: 0,
    sampled_at_utc: sampledAtIso,
    movement_departure_estimate_utc: departureAt,
    estimated_arrival_at_utc: arrivalAt,
    target: {
      kid,
      kingdom: KINGDOM_NAME_BY_KID[kid],
      x,
      y,
      area_type: 11,
      owner_id: expectedOwner,
    },
    attacker_player_id: attackerId,
    attacker_player_name: typeof sourceArea?.ownerInfo?.playerName === 'string' && sourceArea.ownerInfo.playerName.trim()
      ? sourceArea.ownerInfo.playerName.trim()
      : null,
    source: sourceArea && [sourceX, sourceY].every(Number.isFinite)
      ? { area_type: Number(sourceArea.areaType), x: sourceX, y: sourceY }
      : null,
    attack_time_utc: null,
    time_semantics: 'ggejs computes departureTime and arrivalTime locally from elapsed/remaining travel seconds; departure is an estimate, not a server-issued attack timestamp.',
    coverage: 'Only movements returned to the authenticated E4K account session; not a global PL1 feed.',
  };
}


/**
 * True only when MovementManager._add_or_update was called by ggejs' GAM
 * response handler. Other command handlers (CRA/CRM/CSM, etc.) also update
 * MovementManager, so counting every update as a GAM response is unsafe.
 */
export function isGgejsGamDispatchStack(stack) {
  if (typeof stack !== 'string' || stack.length === 0) return false;
  const normalizedStack = stack.split(String.fromCharCode(92)).join('/');
  return normalizedStack
    .split(String.fromCharCode(10))
    .some((line) => line.includes('/commands/gam.js:'));
}


/**
 * Parse the SmartFox XT response envelope before ggejs dispatches its command
 * handler. The wire layout consumed by ggejs is:
 *   %xt%<command>%<opaque-context-field>%<errorCode>%<payload>%
 * The second response field is skipped by ggejs/pygge; its semantics are not
 * assumed to be a server zone. Only the envelope is retained, never the payload.
 */
export function parseGgejsCommandResponseEnvelope(message) {
  if (typeof message !== 'string' || message.length === 0) return null;
  let raw = message;
  if (raw.startsWith('%')) raw = raw.slice(1);
  if (raw.endsWith('%')) raw = raw.slice(0, -1);
  const parts = raw.split('%');
  if (parts[0] !== 'xt' || parts.length < 4) return null;

  const command = String(parts[1] ?? '').toLowerCase();
  if (!command) return null;
  // ggejs/pygge skip this field when decoding the XT response; its semantics
  // are not established here, so preserve it as opaque context rather than a zone.
  const contextField2 = String(parts[2] ?? '');
  const codeText = String(parts[3] ?? '');
  const errorCode = /^-?\d+$/.test(codeText) ? Number(codeText) : null;
  return {
    command,
    context_field_2: contextField2,
    error_code: Number.isSafeInteger(errorCode) ? errorCode : null,
    ok: Number.isSafeInteger(errorCode) ? errorCode === 0 || errorCode === 10005 : null,
  };
}

/**
 * Read only timestamp-related fields from a successful BLS response.
 * BLS.PS is a server-reported age in seconds since the battle. The resulting
 * UTC value is an estimate based on the local response-receipt clock, not the
 * exact attack launch time. The raw payload is never returned or persisted.
 */
export function parseGgejsBattleLogShortResponse(message, receivedAt = new Date().toISOString()) {
  const envelope = parseGgejsCommandResponseEnvelope(message);
  if (!envelope || envelope.command !== 'bls' || envelope.ok !== true) return null;

  let raw = message;
  if (raw.startsWith('%')) raw = raw.slice(1);
  if (raw.endsWith('%')) raw = raw.slice(0, -1);
  const parts = raw.split('%');
  if (parts.length < 5) return null;

  let payload;
  try {
    payload = JSON.parse(parts.slice(4).join('%'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const messageId = Number(payload.MID);
  const battleLogId = Number(payload.LID);
  const rawSeconds = payload.PS;
  const secondsWireValueIsNumeric = typeof rawSeconds === 'number' ||
    (typeof rawSeconds === 'string' && rawSeconds.trim() !== '');
  if (
    !Number.isSafeInteger(messageId) || messageId <= 0 ||
    !Number.isSafeInteger(battleLogId) || battleLogId <= 0 ||
    !secondsWireValueIsNumeric
  ) return null;

  const secondsSinceBattle = typeof rawSeconds === 'number' ? rawSeconds : Number(rawSeconds);
  const receivedAtIso = toIsoDate(receivedAt);
  if (
    !Number.isFinite(secondsSinceBattle) || secondsSinceBattle <= 0 ||
    secondsSinceBattle > Number.MAX_SAFE_INTEGER || !receivedAtIso
  ) return null;

  const battleTimeEstimate = toIsoDate(Date.parse(receivedAtIso) - secondsSinceBattle * 1000);
  if (!battleTimeEstimate) return null;

  const area = payload.AI && typeof payload.AI === 'object' && !Array.isArray(payload.AI)
    ? payload.AI
    : null;
  const asSafeInteger = (value) => {
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : null;
  };
  const rawTarget = area ? {
    area_type: asSafeInteger(area.AT),
    kid: asSafeInteger(area.K),
    x: asSafeInteger(area.X),
    y: asSafeInteger(area.Y),
  } : null;
  const target = rawTarget && Object.values(rawTarget).some(value => value !== null)
    ? rawTarget
    : null;

  return {
    command: 'bls',
    ok: true,
    error_code: envelope.error_code,
    source: 'BLS.PS',
    message_id: messageId,
    battle_log_id: battleLogId,
    seconds_since_battle: secondsSinceBattle,
    received_at_utc: receivedAtIso,
    battle_time_estimate_utc: battleTimeEstimate,
    target,
    time_basis: 'local_BLS_response_receipt_minus_server_reported_seconds_since_battle',
  };
}


/**
 * Read the BLM.PS battle-age field. The BLM response is keyed by LID; when
 * the wire payload omits MID, the caller binds it to the mailbox message whose
 * getBattleLog() call is currently awaiting this BLM response.
 */
export function parseGgejsBattleLogMiddleTimeResponse(message, receivedAt = new Date().toISOString(), reportMessageId = null) {
  const envelope = parseGgejsCommandResponseEnvelope(message);
  if (!envelope || envelope.command !== 'blm' || envelope.ok !== true) return null;

  let raw = message;
  if (raw.startsWith('%')) raw = raw.slice(1);
  if (raw.endsWith('%')) raw = raw.slice(0, -1);
  const parts = raw.split('%');
  if (parts.length < 5) return null;

  let payload;
  try {
    payload = JSON.parse(parts.slice(4).join('%'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const battleLogId = Number(payload.LID);
  const contextMessageId = Number(reportMessageId);
  const wireMessageId = payload.MID === null || payload.MID === undefined ? null : Number(payload.MID);
  const messageId = wireMessageId ?? contextMessageId;
  const rawSeconds = payload.PS;
  const secondsWireValueIsNumeric = typeof rawSeconds === 'number' ||
    (typeof rawSeconds === 'string' && rawSeconds.trim() !== '');
  if (
    !Number.isSafeInteger(battleLogId) || battleLogId <= 0 ||
    !Number.isSafeInteger(messageId) || messageId <= 0 ||
    (wireMessageId !== null && (!Number.isSafeInteger(wireMessageId) || wireMessageId <= 0)) ||
    (wireMessageId !== null && Number.isSafeInteger(contextMessageId) && contextMessageId > 0 && wireMessageId !== contextMessageId) ||
    !secondsWireValueIsNumeric
  ) return null;

  const secondsSinceBattle = typeof rawSeconds === 'number' ? rawSeconds : Number(rawSeconds);
  const receivedAtIso = toIsoDate(receivedAt);
  if (
    !Number.isFinite(secondsSinceBattle) || secondsSinceBattle <= 0 ||
    secondsSinceBattle > Number.MAX_SAFE_INTEGER || !receivedAtIso
  ) return null;

  const battleTimeEstimate = toIsoDate(Date.parse(receivedAtIso) - secondsSinceBattle * 1000);
  if (!battleTimeEstimate) return null;

  return {
    command: 'blm',
    ok: true,
    error_code: envelope.error_code,
    source: 'BLM.PS',
    message_id: messageId,
    message_id_source: wireMessageId === null ? 'active_mailbox_report_fetch' : 'BLM.MID',
    battle_log_id: battleLogId,
    seconds_since_battle: secondsSinceBattle,
    received_at_utc: receivedAtIso,
    battle_time_estimate_utc: battleTimeEstimate,
    target: null,
    time_basis: 'local_BLM_response_receipt_minus_server_reported_seconds_since_battle',
  };
}


/**
 * Summarize an account-scoped, read-only GAM movement snapshot request.
 * GAM may arrive in several response batches. Only batches tied to a verified
 * successful XT response envelope are accepted when status capture is enabled.
 * Coverage remains limited to movements returned to this authenticated account.
 */
export function buildGamProbeSummary({
  requestSent = false,
  preRequestBatches = [],
  responseBatches = [],
  responseStatuses = [],
  responseStatusCaptureEnabled = false,
  ignoredNonGamMovementUpdates = 0,
  requestSentAt = null,
  sampledAt = new Date().toISOString(),
  collectionComplete = false,
  timedOut = false,
  requestError = null,
} = {}) {
  const sampledAtIso = toIsoDate(sampledAt);
  if (!sampledAtIso) throw new Error('Invalid GAM sample timestamp.');

  const before = Array.isArray(preRequestBatches) ? preRequestBatches : [];
  const after = Array.isArray(responseBatches) ? responseBatches : [];
  const captureStatus = responseStatusCaptureEnabled === true;
  const statuses = Array.isArray(responseStatuses) ? responseStatuses : [];
  const requestStatuses = statuses.filter((item) => item?.phase === 'request');
  const successfulStatuses = requestStatuses.filter((item) => item?.ok === true);
  const failedStatuses = requestStatuses.filter((item) => item?.ok === false);
  const unknownStatuses = requestStatuses.filter((item) => item?.ok !== true && item?.ok !== false);
  const isAcceptedBatch = (batch) => !captureStatus || batch?.response_ok === true;
  // Pushes received before the explicit GAM request may be valid observations,
  // but they are not part of that request's snapshot and must never be merged
  // into its evidence/counts.
  const acceptedPreRequestBatches = before.filter(isAcceptedBatch);
  const acceptedResponseBatches = after.filter(isAcceptedBatch);
  const collectEvidence = (batches) => {
    const byMovementId = new Map();
    for (const batch of batches) {
      for (const item of Array.isArray(batch?.evidence) ? batch.evidence : []) {
        const movementId = Number(item?.movement_id);
        if (Number.isSafeInteger(movementId) && movementId > 0) {
          byMovementId.set(movementId, {
            ...item,
            gam_batch_received_at_utc: toIsoDate(batch?.received_at_utc),
          });
        }
      }
    }
    return byMovementId;
  };
  const preRequestEvidenceByMovementId = collectEvidence(acceptedPreRequestBatches);
  const evidenceByMovementId = collectEvidence(acceptedResponseBatches);
  const countMovements = (batches) => batches.reduce((total, batch) => {
    const count = Number(batch?.movement_count);
    return total + (Number.isSafeInteger(count) && count >= 0 ? count : 0);
  }, 0);
  const preRequestMovementCount = countMovements(acceptedPreRequestBatches);
  const movementCount = countMovements(acceptedResponseBatches);
  const sent = requestSent === true;
  let status;
  if (!sent) {
    status = 'gam_request_not_sent';
  } else if (captureStatus && requestStatuses.length === 0) {
    status = after.length > 0 ? 'gam_response_status_unobserved' : 'gam_request_no_response';
  } else if (captureStatus && failedStatuses.length > 0 && successfulStatuses.length === 0) {
    status = 'gam_response_rejected';
  } else if (captureStatus && failedStatuses.length > 0) {
    status = 'gam_response_partial_error';
  } else if (captureStatus && unknownStatuses.length > 0) {
    status = 'gam_response_status_unverified';
  } else if (captureStatus && successfulStatuses.length > 0 && after.length === 0) {
    status = 'gam_response_without_parsed_batch';
  } else if (captureStatus && acceptedResponseBatches.length === 0) {
    status = 'gam_response_without_accepted_batch';
  } else if (!captureStatus && after.length === 0) {
    status = 'gam_request_no_response';
  } else if (collectionComplete) {
    status = 'gam_response_collection_complete';
  } else {
    status = 'gam_response_collection_incomplete';
  }

  const notes = {
    gam_request_not_sent: 'The read-only GAM request was not sent; this is not evidence that no movements exist.',
    gam_request_no_response: 'No GAM response was observed after the request timeout; this does not prove that no active movement exists.',
    gam_response_status_unobserved: 'A GAM handler batch was observed, but its raw XT response status could not be verified; no movement evidence from that batch is accepted.',
    gam_response_rejected: 'The server returned a non-success GAM error code; the resulting empty or partial handler batch is not treated as a successful snapshot.',
    gam_response_partial_error: 'The GAM request produced a mixture of successful and failed response envelopes; the snapshot is incomplete.',
    gam_response_status_unverified: 'At least one GAM response envelope had an unparseable status code; no unverified batch is accepted as movement evidence.',
    gam_response_without_parsed_batch: 'A successful GAM response envelope arrived, but the ggejs GAM handler did not produce a movement batch.',
    gam_response_without_accepted_batch: 'GAM response envelopes arrived, but no corresponding movement batch had a verified successful status.',
    gam_response_collection_complete: 'Successful GAM response batches were collected until the quiet window; coverage is limited to movements returned to this account.',
    gam_response_collection_incomplete: 'At least one successful GAM response arrived, but the response stream did not become quiet before the collection limit.',
  };

  return {
    summary: {
      status,
      request_command: 'gam',
      request_sent: sent,
      observation_mode: 'active_read_only_snapshot_request',
      request_sent_at_utc: toIsoDate(requestSentAt),
      sampled_at_utc: sampledAtIso,
      response_status_capture_enabled: captureStatus,
      pre_request_push_batches: before.length,
      pre_request_accepted_batch_count: acceptedPreRequestBatches.length,
      pre_request_movement_count: preRequestMovementCount,
      pre_request_matching_count: preRequestEvidenceByMovementId.size,
      gam_response_batches: after.length,
      response_batch_count: after.length,
      accepted_response_batch_count: acceptedResponseBatches.length,
      response_status_count: requestStatuses.length,
      response_status_success_count: successfulStatuses.length,
      response_status_error_count: failedStatuses.length,
      response_status_unverified_count: unknownStatuses.length,
      response_statuses: statuses.map((item) => ({
        phase: item?.phase === 'request' ? 'request' : 'pre_request',
        received_at_utc: toIsoDate(item?.received_at_utc),
        command: typeof item?.command === 'string' ? item.command : null,
        connection_zone: typeof item?.connection_zone === 'string' ? item.connection_zone : null,
        context_field_2: typeof item?.context_field_2 === 'string' ? item.context_field_2 : null,
        error_code: Number.isSafeInteger(item?.error_code) ? item.error_code : null,
        ok: item?.ok === true ? true : item?.ok === false ? false : null,
      })),
      ignored_non_gam_movement_updates: Number.isSafeInteger(ignoredNonGamMovementUpdates) && ignoredNonGamMovementUpdates >= 0
        ? ignoredNonGamMovementUpdates
        : 0,
      movement_count: movementCount,
      matching_count: evidenceByMovementId.size,
      collection_complete: collectionComplete === true && status === 'gam_response_collection_complete',
      timed_out: timedOut === true,
      request_error: typeof requestError === 'string' && requestError
        ? requestError.slice(0, 240)
        : null,
      response_batches: after.map((batch) => ({
        received_at_utc: toIsoDate(batch?.received_at_utc),
        movement_count: Number.isSafeInteger(Number(batch?.movement_count)) && Number(batch.movement_count) >= 0
          ? Number(batch.movement_count)
          : 0,
        matching_count: Array.isArray(batch?.evidence) ? batch.evidence.length : 0,
        response_error_code: Number.isSafeInteger(batch?.response_error_code) ? batch.response_error_code : null,
        response_ok: batch?.response_ok === true ? true : batch?.response_ok === false ? false : null,
        accepted: isAcceptedBatch(batch),
      })),
      coverage: 'Only movements returned to the authenticated account session; not a global PL1 feed.',
      note: notes[status],
    },
    evidence: [...evidenceByMovementId.values()],
    pre_request_evidence: [...preRequestEvidenceByMovementId.values()],
  };
}
