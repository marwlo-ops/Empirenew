import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGamProbeSummary, buildObservation, buildScanPlan, compareObservations,
  extractNpcBattleReportEvidence, extractOutboundBossDungeonMovementEvidence,
  isNpcBattleReportMessage, isGgejsGamDispatchStack,
  extractParsedOutboundBossDungeonMovementEvidence,
  parseGgejsCommandResponseEnvelope, parseGgejsBattleLogShortResponse,
  parseGgejsBattleLogMiddleTimeResponse, pickSamples,
  selectLatestNpcBattleReportMessages, validateMapOnlyCatalog,
} from './probe-core.mjs';

function catalog() {
  const results = {};
  for (const [kingdom, kid] of [['sands', 1], ['ice', 2], ['fire', 3]]) {
    const fortresses = [
      { id: `it1-${kid}-10-20`, kid, kingdom, x: 10, y: 20, type: 'dungeon', source_server: 'IT1' },
      { id: `it1-${kid}-110-120`, kid, kingdom, x: 110, y: 120, type: 'dungeon', source_server: 'IT1' },
      { id: `it1-${kid}-210-220`, kid, kingdom, x: 210, y: 220, type: 'dungeon', source_server: 'IT1' },
    ];
    results[kingdom] = { complete: true, fortress_count: fortresses.length, fortresses };
  }
  return { complete: true, server_source: 'IT1', total_count: 9, results };
}

function makeObservation({
  kid = 1,
  x = 10,
  y = 20,
  defeater = 111,
  cooldownUntil = '2026-11-05T14:59:00Z',
  sampledAt = '2026-11-05T15:00:00Z',
  id = `it1-${kid}-${x}-${y}`,
} = {}) {
  const kingdom = ({ 1: 'sands', 2: 'ice', 3: 'fire' })[kid];
  const owner = ({ 1: -230, 2: -231, 3: -232 })[kid];
  const row = {
    areaType: 11,
    kingdomId: kid,
    position: { X: x, Y: y },
    ownerInfo: { playerId: owner },
    defeaterPlayerId: defeater,
  };
  if (cooldownUntil !== undefined) {
    row.attackCooldownEnd = cooldownUntil === null ? null : new Date(cooldownUntil);
  }
  return buildObservation({ id, kid, kingdom, x, y }, [row], sampledAt);
}

test('accepts only complete IT1 map-only data', () => {
  assert.equal(Object.values(validateMapOnlyCatalog(catalog())).flat().length, 9);
});

test('rejects Beta or attack-state fields in the coordinate catalog', () => {
  const beta = catalog(); beta.server_source = 'E4K_PL1_BETA';
  assert.throws(() => validateMapOnlyCatalog(beta), /IT1/);
  const polluted = catalog(); polluted.results.sands.fortresses[0].last_attack = '2026-11-05T00:00:00Z';
  assert.throws(() => validateMapOnlyCatalog(polluted), /attack\/player state/);
});

test('rejects unapproved fields, missing stable IDs and duplicate stable IDs', () => {
  const extra = catalog();
  extra.results.sands.fortresses[0].unreviewed_status = 'ready';
  assert.throws(() => validateMapOnlyCatalog(extra), /Unexpected or missing map-only fortress fields/);

  const missingId = catalog();
  delete missingId.results.sands.fortresses[0].id;
  assert.throws(() => validateMapOnlyCatalog(missingId), /Invalid fortress ID/);

  const duplicateId = catalog();
  duplicateId.results.sands.fortresses[1].id = duplicateId.results.sands.fortresses[0].id;
  assert.throws(() => validateMapOnlyCatalog(duplicateId), /Duplicate fortress ID/);
});

test('groups several targets in the same 100x100 sector into one read', () => {
  const data = catalog();
  for (const kingdom of Object.keys(data.results)) {
    const kid = data.results[kingdom].fortresses[0].kid;
    data.results[kingdom].fortresses = [
      { id: `a-${kingdom}`, kid, kingdom, x: 10, y: 20, type: 'dungeon', source_server: 'IT1' },
      { id: `b-${kingdom}`, kid, kingdom, x: 90, y: 90, type: 'dungeon', source_server: 'IT1' },
    ];
    data.results[kingdom].fortress_count = 2;
  }
  data.total_count = 6;
  const plan = buildScanPlan(data, { all: true });
  assert.equal(plan.summary.target_count, 6);
  assert.equal(plan.summary.sector_count, 3);
  assert.equal(plan.summary.estimated_map_tiles, 30000);
});

test('separates coordinates on either side of a 100-tile boundary', () => {
  const data = catalog();
  for (const kingdom of Object.keys(data.results)) {
    const kid = data.results[kingdom].fortresses[0].kid;
    data.results[kingdom].fortresses = [
      { id: `a-${kingdom}`, kid, kingdom, x: 99, y: 20, type: 'dungeon', source_server: 'IT1' },
      { id: `b-${kingdom}`, kid, kingdom, x: 100, y: 20, type: 'dungeon', source_server: 'IT1' },
    ];
    data.results[kingdom].fortress_count = 2;
  }
  data.total_count = 6;
  assert.equal(buildScanPlan(data, { all: true }).summary.sector_count, 6);
});

test('selects deterministic unique samples', () => {
  const points = Array.from({ length: 10 }, (_, i) => ({ x: i, y: i }));
  assert.deepEqual(pickSamples(points, 3).map((p) => p.x), [0, 5, 9]);
  assert.equal(new Set(pickSamples(points, 5).map((p) => p.x)).size, 5);
});

test('accepts only a BossDungeonMapobject type 11 row with the expected NPC owner', () => {
  const target = { id: 'it1-1-10-20', kid: 1, kingdom: 'sands', x: 10, y: 20 };
  const row = {
    areaType: 11, kingdomId: 1, dungeonLevel: 72, defeaterPlayerId: 123456,
    position: { X: 10, Y: 20 }, ownerInfo: { playerId: -230 },
    attackCooldownEnd: new Date('2026-11-05T16:00:00Z'),
    lastSpyDate: new Date('2026-11-05T14:00:00Z'),
  };
  const observation = buildObservation(target, [row], '2026-11-05T15:00:00Z');
  assert.equal(observation.status, 'fortress_row_found');
  assert.equal(observation.owner_id, -230);
  assert.equal(observation.dungeon_level, 72);
  assert.equal(observation.defeater_player_id, 123456);
  assert.equal(observation.cooldown_active, true);
  assert.equal(observation.attack_time_utc, null);
});

test('does not accept a regular type 2 dungeon, player castle or wrong type 11 NPC owner', () => {
  const target = { id: 'it1-1-10-20', kid: 1, kingdom: 'sands', x: 10, y: 20 };
  const rows = [
    { areaType: 1, kingdomId: 1, position: { X: 10, Y: 20 }, ownerInfo: { playerId: 123 } },
    { areaType: 2, kingdomId: 1, position: { X: 10, Y: 20 }, ownerInfo: { playerId: -220 } },
    { areaType: 11, kingdomId: 1, position: { X: 10, Y: 20 }, ownerInfo: { playerId: -231 } },
  ];
  assert.equal(buildObservation(target, rows).status, 'ambiguous_duplicate_rows');
});

test('reports no row as not confirmed, not as an attack', () => {
  const target = { id: 'it1-1-10-20', kid: 1, kingdom: 'sands', x: 10, y: 20 };
  const observation = buildObservation(target, [], '2026-11-05T15:00:00Z');
  assert.equal(observation.status, 'not_confirmed');
  assert.equal(observation.attack_time_utc, null);
});

test('reports a combined cooldown and defeater transition only for one exact verified fortress row', () => {
  const previous = makeObservation({
    defeater: 111,
    cooldownUntil: '2026-11-05T14:59:00Z',
    sampledAt: '2026-11-05T15:00:00Z',
  });
  const current = makeObservation({
    defeater: 222,
    cooldownUntil: '2026-11-05T16:10:00Z',
    sampledAt: '2026-11-05T15:10:00Z',
  });
  const signals = compareObservations(previous, current);
  assert.deepEqual(signals.map((signal) => signal.kind), ['target_attack_transition_candidate']);
  assert.equal(signals[0].classification, 'candidate_same_target_cooldown_transition_with_positive_defeater');
  assert.deepEqual(signals[0].metrics, [
    'BossDungeonMapobject.attackCooldownEnd',
    'BossDungeonMapobject.defeaterPlayerId',
  ]);
  assert.equal(signals[0].player_id, 222);
  assert.equal(signals[0].defeater_changed, true);
  assert.equal(signals[0].attack_time_utc, null);
  assert.equal(signals[0].interval_start_utc, '2026-11-05T15:00:00.000Z');
  assert.equal(signals[0].interval_end_utc, '2026-11-05T15:10:00.000Z');
  assert.equal(signals[0].interval_seconds, 600);
});

test('requires identical catalog ID, kingdom, KID, X/Y, NPC owner contract and increasing sample times', () => {
  const previous = makeObservation({
    sampledAt: '2026-11-05T15:00:00Z',
    cooldownUntil: '2026-11-05T14:59:00Z',
  });
  const current = makeObservation({
    defeater: 222,
    sampledAt: '2026-11-05T15:10:00Z',
    cooldownUntil: '2026-11-05T16:10:00Z',
  });
  assert.deepEqual(compareObservations(previous, {
    ...current, target: { ...current.target, x: 11 },
  }), []);
  assert.deepEqual(compareObservations(previous, {
    ...current, target: { ...current.target, catalog_id_it1: 'different-id' },
  }), []);
  assert.deepEqual(compareObservations(previous, {
    ...current, target: { ...current.target, kingdom: 'ice' },
  }), []);
  assert.deepEqual(compareObservations(previous, {
    ...current, target: { ...current.target, expected_area_type: 2 },
  }), []);
  assert.deepEqual(compareObservations(previous, {
    ...current, target: { ...current.target, expected_boss_dungeon_owner_id: -231 },
  }), []);
  assert.deepEqual(compareObservations(previous, {
    ...current, sampled_at_utc: '2026-11-05T14:59:59Z',
  }), []);
  assert.deepEqual(compareObservations(previous, {
    ...current, sampled_at_utc: 'not-a-date',
  }), []);
});

test('recognizes a repeat win by the same player when the exact target cooldown restarts', () => {
  const previous = makeObservation({
    kid: 2, x: 300, y: 400, defeater: 98765,
    cooldownUntil: '2026-11-05T14:59:00Z',
    sampledAt: '2026-11-05T15:00:00Z',
  });
  const current = makeObservation({
    kid: 2, x: 300, y: 400, defeater: 98765,
    cooldownUntil: '2026-11-05T15:04:30Z',
    sampledAt: '2026-11-05T15:04:00Z',
  });
  const [signal] = compareObservations(previous, current);
  assert.equal(signal.kind, 'target_attack_transition_candidate');
  assert.equal(signal.player_id, 98765);
  assert.equal(signal.defeater_changed, false);
  assert.equal(signal.attack_time_utc, null);
});

test('keeps single-field changes as partial candidates, not combined attack transitions', () => {
  const previous = makeObservation({
    kid: 3, x: 500, y: 600, defeater: 111,
    cooldownUntil: '2026-11-05T14:59:00Z',
    sampledAt: '2026-11-05T15:00:00Z',
  });
  const idOnly = compareObservations(previous, makeObservation({
    kid: 3, x: 500, y: 600, defeater: 222,
    cooldownUntil: '2026-11-05T14:59:00Z',
    sampledAt: '2026-11-05T15:05:00Z',
  }));
  assert.deepEqual(idOnly.map((signal) => signal.kind), ['target_defeater_id_changed']);

  const cooldownOnly = compareObservations(previous, makeObservation({
    kid: 3, x: 500, y: 600, defeater: null,
    cooldownUntil: '2026-11-05T15:06:00Z',
    sampledAt: '2026-11-05T15:05:00Z',
  }));
  assert.deepEqual(cooldownOnly.map((signal) => signal.kind), ['target_cooldown_started']);
});

test('does not compare forged, incomplete or unverified observation records', () => {
  const current = makeObservation({
    defeater: 123456,
    cooldownUntil: '2026-11-05T16:00:00Z',
    sampledAt: '2026-11-05T15:10:00Z',
  });
  assert.deepEqual(compareObservations(null, current), []);
  assert.deepEqual(compareObservations({ status: 'not_confirmed' }, current), []);
  assert.deepEqual(compareObservations({
    status: 'fortress_row_found',
    sampled_at_utc: '2026-11-05T15:00:00Z',
    target: current.target,
    defeater_player_id: 111,
    cooldown_active: false,
  }, current), []);
  assert.deepEqual(compareObservations({
    ...current,
    rows: [{ ...current.rows[0], owner_id: 999 }],
  }, current), []);
});

test('does not create a transition candidate when the observation interval exceeds two hours', () => {
  const previous = makeObservation({
    sampledAt: '2026-11-05T12:00:00Z',
    cooldownUntil: '2026-11-05T11:59:00Z',
  });
  const current = makeObservation({
    defeater: 222,
    sampledAt: '2026-11-05T14:00:01Z',
    cooldownUntil: '2026-11-05T15:00:00Z',
  });
  assert.deepEqual(compareObservations(previous, current), []);
});

test('marks multiple rows at one coordinate ambiguous even when only one row has the expected NPC owner', () => {
  const target = { id: 'it1-1-10-20', kid: 1, kingdom: 'sands', x: 10, y: 20 };
  const valid = {
    areaType: 11, kingdomId: 1, position: { X: 10, Y: 20 },
    ownerInfo: { playerId: -230 }, defeaterPlayerId: 123456,
    attackCooldownEnd: new Date('2026-11-05T16:00:00Z'),
  };
  const unrelated = {
    areaType: 2, kingdomId: 1, position: { X: 10, Y: 20 },
    ownerInfo: { playerId: -220 },
  };
  const observation = buildObservation(target, [valid, unrelated], '2026-11-05T15:00:00Z');
  assert.equal(observation.status, 'ambiguous_duplicate_rows');
  assert.deepEqual(compareObservations(
    makeObservation({ sampledAt: '2026-11-05T14:59:00Z' }),
    observation,
  ), []);
});

test('rejects invalid fortress targets before matching map rows', () => {
  assert.throws(() => buildObservation({
    id: 'bad', kid: 4, kingdom: 'sands', x: 10, y: 20,
  }, [], '2026-11-05T15:00:00Z'), /Invalid fortress target/);
  assert.throws(() => buildObservation({
    id: '', kid: 1, kingdom: 'sands', x: 10, y: 20,
  }, [], '2026-11-05T15:00:00Z'), /Invalid fortress target/);
});

test('keeps a missing cooldown as unknown and does not create a false cooldown-start signal', () => {
  const target = { id: 'it1-1-10-20', kid: 1, kingdom: 'sands', x: 10, y: 20 };
  const previous = buildObservation(target, [{
    areaType: 11, kingdomId: 1, position: { X: 10, Y: 20 }, ownerInfo: { playerId: -230 },
    defeaterPlayerId: 123456,
  }], '2026-11-05T15:00:00Z');
  const current = buildObservation(target, [{
    areaType: 11, kingdomId: 1, position: { X: 10, Y: 20 }, ownerInfo: { playerId: -230 },
    defeaterPlayerId: 123456, attackCooldownEnd: new Date('2026-11-05T16:00:00Z'),
  }], '2026-11-05T15:10:00Z');
  assert.equal(previous.cooldown_active, null);
  assert.equal(current.cooldown_active, true);
  assert.deepEqual(compareObservations(previous, current), []);
});

test('rejects an invalid observation timestamp instead of classifying cooldown state', () => {
  const target = { id: 'it1-1-10-20', kid: 1, kingdom: 'sands', x: 10, y: 20 };
  assert.throws(() => buildObservation(target, [], 'not-a-date'), /Invalid observation timestamp/);
});


test('recognizes ggejs NPC report subtype from metadata when the parsed property remains default zero', () => {
  const message = {
    messageType: 6, areaType: 11, subType: 0,
    metadata: '11+2+0#1+-230', kingdomId: 1, ownerId: -230,
  };
  assert.equal(isNpcBattleReportMessage(message), true);
  assert.equal(extractNpcBattleReportEvidence(message, {
    mapobject: { areaType: 11, kingdomId: 1, position: { X: 321, Y: 654 } },
    attacker: { playerId: 1234567 }, defender: { playerId: -230 },
  }).attacker_player_id, 1234567);
  assert.equal(isNpcBattleReportMessage({ ...message, metadata: '11+0+0#1+-230' }), false);
});

test('selects newest NPC reports using metadata subtype and excludes unrelated messages', () => {
  const older = {
    messageType: 6, areaType: 11, subType: 0, metadata: '11+2+0#1+-230',
    kingdomId: 1, ownerId: -230, messageId: 10,
    deliveryTime: new Date('2026-11-05T18:00:00Z'),
  };
  const newest = { ...older, messageId: 12, deliveryTime: new Date('2026-11-05T18:20:00Z') };
  const middle = { ...older, messageId: 11, deliveryTime: new Date('2026-11-05T18:10:00Z') };
  const unrelated = { ...newest, messageId: 13, metadata: '11+0+0#1+-230' };
  const selected = selectLatestNpcBattleReportMessages([older, unrelated, newest, middle], 2);
  assert.deepEqual(selected.map((message) => message.messageId), [12, 11]);
  assert.deepEqual(selectLatestNpcBattleReportMessages(null, 2), []);
  assert.throws(() => selectLatestNpcBattleReportMessages([older], 0), /limit/);
});

test('extracts exact target and attacker from a matching NPC boss-dungeon battle report', () => {
  const message = {
    messageType: 6, areaType: 11, subType: 2, kingdomId: 1, ownerId: -230,
    messageId: 501, deliveryTime: new Date('2026-11-05T18:00:00Z'), hasAttackerWon: true, isForwarded: false,
  };
  const battleLog = {
    battleLogId: 9001,
    mapobject: { areaType: 11, kingdomId: 1, position: { X: 321, Y: 654 } },
    attacker: { playerId: 1234567, ownerInfo: { playerName: 'Test Attacker' } },
    defender: { playerId: -230 },
  };
  const evidence = extractNpcBattleReportEvidence(message, battleLog);
  assert.deepEqual(evidence.target, { kid: 1, kingdom: 'sands', x: 321, y: 654, area_type: 11, owner_id: -230 });
  assert.equal(evidence.attacker_player_id, 1234567);
  assert.equal(evidence.attacker_player_name, 'Test Attacker');
  assert.equal(evidence.outcome, 'attacker_won');
  assert.equal(evidence.report_delivery_time_estimate_utc, '2026-11-05T18:00:00.000Z');
  assert.equal(evidence.message_is_forwarded, false);
  assert.equal(evidence.report_delivery_kind, 'original_mailbox_entry');
  assert.equal(evidence.attack_time_utc, null);
  assert.equal(evidence.classification, 'confirmed_battle_report_target_and_attacker');
});

test('rejects non-NPC and non-boss-dungeon battle report metadata', () => {
  const message = { messageType: 6, areaType: 2, subType: 2, kingdomId: 1, ownerId: -230 };
  const battleLog = {
    mapobject: { areaType: 2, kingdomId: 1, position: { X: 321, Y: 654 } },
    attacker: { playerId: 1234567 }, defender: { playerId: -230 },
  };
  assert.equal(extractNpcBattleReportEvidence(message, battleLog), null);
  assert.equal(extractNpcBattleReportEvidence({ ...message, areaType: 11, subType: 0 }, battleLog), null);
});

test('rejects a report when message owner, battle defender or map kingdom disagree', () => {
  const message = { messageType: 6, areaType: 11, subType: 2, kingdomId: 2, ownerId: -231 };
  const base = {
    mapobject: { areaType: 11, kingdomId: 2, position: { X: 321, Y: 654 } },
    attacker: { playerId: 1234567 }, defender: { playerId: -231 },
  };
  assert.equal(extractNpcBattleReportEvidence(message, { ...base, defender: { playerId: -230 } }), null);
  assert.equal(extractNpcBattleReportEvidence(message, { ...base, mapobject: { ...base.mapobject, kingdomId: 1 } }), null);
  assert.equal(extractNpcBattleReportEvidence({ ...message, ownerId: -230 }, base), null);
});

test('does not create mailbox report evidence without a positive attacker and exact coordinates', () => {
  const message = { messageType: 6, areaType: 11, subType: 2, kingdomId: 3, ownerId: -232 };
  const base = {
    mapobject: { areaType: 11, kingdomId: 3, position: { X: 100, Y: 200 } },
    attacker: { playerId: 0 }, defender: { playerId: -232 },
  };
  assert.equal(extractNpcBattleReportEvidence(message, base), null);
  assert.equal(extractNpcBattleReportEvidence(message, {
    ...base, attacker: { playerId: 98765 }, mapobject: { ...base.mapobject, position: { X: null, Y: 200 } },
  }), null);
});


test('marks forwarded NPC battle reports so delivery time is not mistaken for original report time', () => {
  const message = {
    messageType: 6, areaType: 11, subType: 2, kingdomId: 2, ownerId: -231,
    deliveryTime: new Date('2026-11-05T18:05:00Z'), isForwarded: true,
  };
  const battleLog = {
    mapobject: { areaType: 11, kingdomId: 2, position: { X: 400, Y: 500 } },
    attacker: { playerId: 987654 }, defender: { playerId: -231 },
  };
  const evidence = extractNpcBattleReportEvidence(message, battleLog);
  assert.equal(evidence.message_is_forwarded, true);
  assert.equal(evidence.report_delivery_kind, 'forwarded_to_this_account');
  assert.equal(evidence.attack_time_utc, null);
});


test('extracts a confirmed outbound NPC movement to the exact BossDungeonMapobject target', () => {
  const movement = {
    MID: 77123, T: 11, D: 0, KID: 1, SID: 1234567, TID: -230,
    PT: 125, TT: 600, ATT: 2,
    SA: [1, 200, 300],
    TA: [11, 321, 654, -1, 72, 0, 1234567, 1],
  };
  const evidence = extractOutboundBossDungeonMovementEvidence(movement, '2026-11-05T20:00:00Z');
  assert.equal(evidence.classification, 'observed_outbound_npc_attack_movement_to_boss_dungeon');
  assert.equal(evidence.movement_id, 77123);
  assert.equal(evidence.attacker_player_id, 1234567);
  assert.deepEqual(evidence.target, {
    kid: 1, kingdom: 'sands', x: 321, y: 654, area_type: 11, owner_id: -230,
  });
  assert.equal(evidence.movement_departure_estimate_utc, '2026-11-05T19:57:55.000Z');
  assert.equal(evidence.estimated_arrival_at_utc, '2026-11-05T20:07:55.000Z');
  assert.equal(evidence.attack_time_utc, null);
  assert.match(evidence.time_semantics, /estimated/);
  assert.match(evidence.coverage, /not a global PL1 feed/);
});

test('rejects movements unless movement type, target type, kingdom and NPC owner all agree', () => {
  const movement = {
    MID: 77123, T: 11, D: 0, KID: 2, SID: 1234567, TID: -231,
    PT: 10, TT: 100, TA: [11, 321, 654, -1, 72, 0, 1234567, 2],
  };
  assert.equal(extractOutboundBossDungeonMovementEvidence({ ...movement, T: 0 }), null);
  assert.equal(extractOutboundBossDungeonMovementEvidence({ ...movement, TA: [2, 321, 654, -1, 72, 0, 1234567, 2] }), null);
  assert.equal(extractOutboundBossDungeonMovementEvidence({ ...movement, KID: 1 }), null);
  assert.equal(extractOutboundBossDungeonMovementEvidence({ ...movement, TID: -230 }), null);
  assert.equal(extractOutboundBossDungeonMovementEvidence({ ...movement, TA: [11, 321, 654, -1, 72, 0, 1234567, 1] }), null);
});

test('rejects returning, expired, untimed or unattributed NPC movements', () => {
  const movement = {
    MID: 77123, T: 11, D: 0, KID: 3, SID: 1234567, TID: -232,
    PT: 10, TT: 100, TA: [11, 321, 654, -1, 72, 0, 1234567, 3],
  };
  assert.equal(extractOutboundBossDungeonMovementEvidence({ ...movement, D: 1 }), null);
  assert.equal(extractOutboundBossDungeonMovementEvidence({ ...movement, PT: 100 }), null);
  assert.equal(extractOutboundBossDungeonMovementEvidence({ ...movement, PT: -1 }), null);
  assert.equal(extractOutboundBossDungeonMovementEvidence({ ...movement, SID: 0 }), null);
  assert.equal(extractOutboundBossDungeonMovementEvidence({ ...movement, MID: 0 }), null);
  assert.throws(() => extractOutboundBossDungeonMovementEvidence(movement, 'not-a-date'), /Invalid movement sample timestamp/);
});


test('normalizes a parsed ggejs movement with exact boss target and positive source owner', () => {
  const movement = {
    movementType: 11, direction: 0, movementId: 77124, kingdomId: 1, attackType: 2,
    departureTime: new Date('2026-11-05T19:57:55Z'),
    arrivalTime: new Date('2026-11-05T20:07:55Z'),
    sourceArea: {
      areaType: 1, position: { X: 200, Y: 300 }, ownerInfo: { playerId: 1234567, playerName: 'Movement Attacker' },
    },
    targetArea: {
      areaType: 11, kingdomId: 1, position: { X: 321, Y: 654 }, ownerInfo: { playerId: -230 },
    },
  };
  const evidence = extractParsedOutboundBossDungeonMovementEvidence(movement, '2026-11-05T20:00:00Z');
  assert.equal(evidence.classification, 'observed_outbound_npc_attack_movement_to_boss_dungeon');
  assert.equal(evidence.attacker_player_id, 1234567);
  assert.equal(evidence.attacker_player_name, 'Movement Attacker');
  assert.equal(evidence.movement_id, 77124);
  assert.deepEqual(evidence.target, {
    kid: 1, kingdom: 'sands', x: 321, y: 654, area_type: 11, owner_id: -230,
  });
  assert.equal(evidence.movement_departure_estimate_utc, '2026-11-05T19:57:55.000Z');
  assert.equal(evidence.estimated_arrival_at_utc, '2026-11-05T20:07:55.000Z');
  assert.equal(evidence.attack_time_utc, null);
  assert.match(evidence.coverage, /not a global PL1 feed/);
});

test('rejects parsed movements with wrong direction/type/owner, missing player or expired timing', () => {
  const movement = {
    movementType: 11, direction: 0, movementId: 77124, kingdomId: 2,
    departureTime: new Date('2026-11-05T19:59:00Z'),
    arrivalTime: new Date('2026-11-05T20:05:00Z'),
    sourceArea: { ownerInfo: { playerId: 1234567 } },
    targetArea: {
      areaType: 11, kingdomId: 2, position: { X: 321, Y: 654 }, ownerInfo: { playerId: -231 },
    },
  };
  assert.equal(extractParsedOutboundBossDungeonMovementEvidence({ ...movement, direction: 1 }, '2026-11-05T20:00:00Z'), null);
  assert.equal(extractParsedOutboundBossDungeonMovementEvidence({ ...movement, movementType: 0 }, '2026-11-05T20:00:00Z'), null);
  assert.equal(extractParsedOutboundBossDungeonMovementEvidence({
    ...movement, targetArea: { ...movement.targetArea, ownerInfo: { playerId: -230 } },
  }, '2026-11-05T20:00:00Z'), null);
  assert.equal(extractParsedOutboundBossDungeonMovementEvidence({
    ...movement, sourceArea: { ownerInfo: { playerId: -231 } },
  }, '2026-11-05T20:00:00Z'), null);
  assert.equal(extractParsedOutboundBossDungeonMovementEvidence({
    ...movement, arrivalTime: new Date('2026-11-05T19:59:59Z'),
  }, '2026-11-05T20:00:00Z'), null);
  assert.throws(() => extractParsedOutboundBossDungeonMovementEvidence(movement, 'not-a-date'), /Invalid parsed movement sample timestamp/);
});


test('recognizes only the ggejs GAM response handler stack', () => {
  const newline = String.fromCharCode(10);
  const backslash = String.fromCharCode(92);
  const gamStack = [
    'Error',
    '    at Object.execute (/opt/app/node_modules/ggejs/src/commands/gam.js:13:22)',
    '    at executeResponse (/opt/app/node_modules/ggejs/src/commands/index.js:55:13)',
  ].join(newline);
  const windowsGamStack = 'Error' + newline +
    '    at Object.execute (C:' + backslash + 'app' + backslash +
    'node_modules' + backslash + 'ggejs' + backslash + 'src' + backslash +
    'commands' + backslash + 'gam.js:13:22)';
  const otherStack = [
    'Error',
    '    at Object.execute (/opt/app/node_modules/ggejs/src/commands/cra.js:20:22)',
    '    at executeResponse (/opt/app/node_modules/ggejs/src/commands/index.js:55:13)',
  ].join(newline);
  assert.equal(isGgejsGamDispatchStack(gamStack), true);
  assert.equal(isGgejsGamDispatchStack(windowsGamStack), true);
  assert.equal(isGgejsGamDispatchStack(otherStack), false);
  assert.equal(isGgejsGamDispatchStack(''), false);
  assert.equal(isGgejsGamDispatchStack(null), false);
});


test('summarizes a read-only GAM request, collects response batches and deduplicates movement IDs', () => {
  const first = { movement_id: 7001, target: { kid: 1, x: 321, y: 654 } };
  const second = { movement_id: 7002, target: { kid: 2, x: 400, y: 500 } };
  const result = buildGamProbeSummary({
    requestSent: true,
    requestSentAt: '2026-11-05T21:00:00Z',
    sampledAt: '2026-11-05T21:00:01Z',
    preRequestBatches: [{
      received_at_utc: '2026-11-05T20:59:59Z',
      movement_count: 2,
      evidence: [first, { movement_id: 6999, target: { kid: 3, x: 111, y: 222 } }],
      response_ok: true,
    }],
    responseBatches: [
      {
        received_at_utc: '2026-11-05T21:00:00.100Z',
        movement_count: 2,
        evidence: [first, second],
      },
      {
        received_at_utc: '2026-11-05T21:00:00.250Z',
        movement_count: 1,
        evidence: [{ ...second, attacker_player_id: 1234567 }],
      },
    ],
    ignoredNonGamMovementUpdates: 3,
    collectionComplete: true,
    timedOut: false,
  });

  assert.equal(result.summary.status, 'gam_response_collection_complete');
  assert.equal(result.summary.request_command, 'gam');
  assert.equal(result.summary.request_sent, true);
  assert.equal(result.summary.observation_mode, 'active_read_only_snapshot_request');
  assert.equal(result.summary.pre_request_push_batches, 1);
  assert.equal(result.summary.pre_request_accepted_batch_count, 1);
  assert.equal(result.summary.pre_request_movement_count, 2);
  assert.equal(result.summary.pre_request_matching_count, 2);
  assert.equal(result.summary.gam_response_batches, 2);
  assert.equal(result.summary.movement_count, 3);
  assert.equal(result.summary.matching_count, 2);
  assert.deepEqual(result.evidence.map((item) => item.movement_id).sort(), [7001, 7002]);
  assert.deepEqual(result.pre_request_evidence.map((item) => item.movement_id).sort(), [6999, 7001]);
  assert.equal(result.summary.ignored_non_gam_movement_updates, 3);
  assert.equal(result.summary.collection_complete, true);
  assert.equal(result.evidence.length, 2);
  assert.equal(result.evidence.find((item) => item.movement_id === 7002).attacker_player_id, 1234567);
  assert.match(result.summary.coverage, /not a global PL1 feed/);
});

test('does not infer an empty movement map when a read-only GAM request gets no response', () => {
  const result = buildGamProbeSummary({
    requestSent: true,
    requestSentAt: '2026-11-05T21:00:00Z',
    sampledAt: '2026-11-05T21:00:05Z',
    responseBatches: [],
    collectionComplete: false,
    timedOut: true,
  });

  assert.equal(result.summary.status, 'gam_request_no_response');
  assert.equal(result.summary.request_sent, true);
  assert.equal(result.summary.movement_count, 0);
  assert.equal(result.summary.matching_count, 0);
  assert.equal(result.summary.timed_out, true);
  assert.match(result.summary.note, /does not prove that no active movement exists/);
  assert.deepEqual(result.evidence, []);
});

test('keeps pre-request push evidence separate when the explicit GAM request gets no response', () => {
  const result = buildGamProbeSummary({
    requestSent: true,
    requestSentAt: '2026-11-05T21:10:00Z',
    sampledAt: '2026-11-05T21:10:05Z',
    responseStatusCaptureEnabled: true,
    preRequestBatches: [{
      phase: 'pre_request',
      received_at_utc: '2026-11-05T21:09:59Z',
      movement_count: 1,
      response_ok: true,
      evidence: [{ movement_id: 7010, target: { kid: 1, x: 10, y: 20 } }],
    }],
    responseStatuses: [],
    responseBatches: [],
    collectionComplete: false,
    timedOut: true,
  });

  assert.equal(result.summary.status, 'gam_request_no_response');
  assert.equal(result.summary.pre_request_movement_count, 1);
  assert.equal(result.summary.movement_count, 0);
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.pre_request_evidence.map((item) => item.movement_id), [7010]);
});

test('marks a disconnected GAM request as not sent instead of as an empty snapshot', () => {
  const result = buildGamProbeSummary({
    requestSent: false,
    sampledAt: '2026-11-05T21:00:00Z',
    requestError: 'SocketManager.sendCommand returned false',
  });

  assert.equal(result.summary.status, 'gam_request_not_sent');
  assert.equal(result.summary.request_sent, false);
  assert.equal(result.summary.request_error, 'SocketManager.sendCommand returned false');
  assert.equal(result.summary.timed_out, false);
});

test('parses the ggejs XT response envelope without retaining account payload data', () => {
  const success = parseGgejsCommandResponseEnvelope(
    '%xt%gam%EmpirefourkingdomsExGG_3%0%{"M":[],"O":[]}%'
  );
  assert.deepEqual(success, {
    command: 'gam', context_field_2: 'EmpirefourkingdomsExGG_3', error_code: 0, ok: true,
  });
  assert.equal(Object.hasOwn(success, 'zone'), false);
  const acceptedLegacyCode = parseGgejsCommandResponseEnvelope(
    '%xt%gam%EmpirefourkingdomsExGG_3%10005%{}%'
  );
  assert.equal(acceptedLegacyCode.ok, true);
  const rejected = parseGgejsCommandResponseEnvelope(
    '%xt%gam%EmpirefourkingdomsExGG_3%42%{}%'
  );
  assert.equal(rejected.error_code, 42);
  assert.equal(rejected.ok, false);
  assert.equal(parseGgejsCommandResponseEnvelope('%xt%gaa%EmpirefourkingdomsExGG_3%0%{}%').command, 'gaa');
  assert.equal(parseGgejsCommandResponseEnvelope('%xt%gam%EmpirefourkingdomsExGG_3%bad%{}%').ok, null);
  assert.equal(parseGgejsCommandResponseEnvelope('<msg t="sys"></msg>'), null);
  assert.equal(parseGgejsCommandResponseEnvelope(null), null);
});

test('does not label an error-code GAM handler batch as a successful empty snapshot', () => {
  const result = buildGamProbeSummary({
    requestSent: true,
    requestSentAt: '2026-11-05T22:30:00Z',
    sampledAt: '2026-11-05T22:30:01Z',
    responseStatusCaptureEnabled: true,
    responseStatuses: [{
      phase: 'request', command: 'gam', connection_zone: 'EmpirefourkingdomsExGG_3', context_field_2: 'opaque',
      error_code: 42, ok: false, received_at_utc: '2026-11-05T22:30:00.100Z',
    }],
    responseBatches: [{
      phase: 'request', movement_count: 0, evidence: [],
      response_error_code: 42, response_ok: false,
      received_at_utc: '2026-11-05T22:30:00.101Z',
    }],
    collectionComplete: true,
  });
  assert.equal(result.summary.status, 'gam_response_rejected');
  assert.equal(result.summary.collection_complete, false);
  assert.equal(result.summary.response_status_error_count, 1);
  assert.equal(result.summary.accepted_response_batch_count, 0);
  assert.equal(result.summary.movement_count, 0);
  assert.deepEqual(result.evidence, []);
  assert.match(result.summary.note, /non-success GAM error code/);
});

test('does not accept a GAM batch when the raw response status could not be verified', () => {
  const result = buildGamProbeSummary({
    requestSent: true,
    responseStatusCaptureEnabled: true,
    responseStatuses: [{
      phase: 'request', command: 'gam', connection_zone: 'EmpirefourkingdomsExGG_3', context_field_2: 'opaque',
      error_code: null, ok: null,
    }],
    responseBatches: [{
      phase: 'request', movement_count: 1, evidence: [{ movement_id: 7003 }],
      response_error_code: null, response_ok: null,
    }],
    collectionComplete: true,
  });
  assert.equal(result.summary.status, 'gam_response_status_unverified');
  assert.equal(result.summary.collection_complete, false);
  assert.equal(result.summary.movement_count, 0);
  assert.equal(result.summary.matching_count, 0);
  assert.deepEqual(result.evidence, []);
});

test('accepts a parsed GAM batch only when its response envelope reports success', () => {
  const result = buildGamProbeSummary({
    requestSent: true,
    requestSentAt: '2026-11-05T22:40:00Z',
    sampledAt: '2026-11-05T22:40:01Z',
    responseStatusCaptureEnabled: true,
    responseStatuses: [{
      phase: 'request', command: 'gam', connection_zone: 'EmpirefourkingdomsExGG_3', context_field_2: 'opaque',
      error_code: 0, ok: true, received_at_utc: '2026-11-05T22:40:00.100Z',
    }],
    responseBatches: [{
      phase: 'request', movement_count: 1, evidence: [{ movement_id: 7004 }],
      response_error_code: 0, response_ok: true,
      received_at_utc: '2026-11-05T22:40:00.101Z',
    }],
    collectionComplete: true,
  });
  assert.equal(result.summary.status, 'gam_response_collection_complete');
  assert.equal(result.summary.response_status_success_count, 1);
  assert.equal(result.summary.accepted_response_batch_count, 1);
  assert.equal(result.summary.movement_count, 1);
  assert.equal(result.summary.matching_count, 1);
  assert.equal(result.evidence[0].movement_id, 7004);
});



test('extracts BLS.PS as an estimated battle-occurrence time without retaining the raw payload', () => {
  const payload = {
    MID: 501, LID: 9001, PS: 120,
    AI: { AT: 11, K: 1, X: 321, Y: 654 },
  };
  const raw = '%xt%bls%opaque-context%0%' + JSON.stringify(payload) + '%';
  const result = parseGgejsBattleLogShortResponse(raw, '2026-11-06T00:00:00Z');
  assert.equal(result.command, 'bls');
  assert.equal(result.source, 'BLS.PS');
  assert.equal(result.message_id, 501);
  assert.equal(result.battle_log_id, 9001);
  assert.equal(result.seconds_since_battle, 120);
  assert.equal(result.received_at_utc, '2026-11-06T00:00:00.000Z');
  assert.equal(result.battle_time_estimate_utc, '2026-11-05T23:58:00.000Z');
  assert.deepEqual(result.target, { area_type: 11, kid: 1, x: 321, y: 654 });
  assert.equal(Object.hasOwn(result, 'payload'), false);
  assert.equal(Object.hasOwn(result, 'raw'), false);
});

test('rejects BLS time metadata unless the XT response succeeds and PS is valid', () => {
  const payload = { MID: 501, LID: 9001, PS: 120, AI: { AT: 11, K: 1, X: 321, Y: 654 } };
  const json = JSON.stringify(payload);
  assert.equal(parseGgejsBattleLogShortResponse('%xt%gam%opaque%0%' + json + '%'), null);
  assert.equal(parseGgejsBattleLogShortResponse('%xt%bls%opaque%42%' + json + '%'), null);
  assert.equal(parseGgejsBattleLogShortResponse('%xt%bls%opaque%0%not-json%'), null);
  assert.equal(parseGgejsBattleLogShortResponse('%xt%bls%opaque%0%' + JSON.stringify({ ...payload, PS: null }) + '%'), null);
  assert.equal(parseGgejsBattleLogShortResponse('%xt%bls%opaque%0%' + JSON.stringify({ ...payload, PS: -1 }) + '%'), null);
  assert.equal(parseGgejsBattleLogShortResponse('%xt%bls%opaque%0%' + JSON.stringify({ ...payload, PS: 0 }) + '%'), null);
  assert.equal(parseGgejsBattleLogShortResponse('%xt%bls%opaque%0%' + JSON.stringify({ ...payload, PS: true }) + '%'), null);
  assert.equal(parseGgejsBattleLogShortResponse('%xt%bls%opaque%0%' + JSON.stringify({ ...payload, PS: [120] }) + '%'), null);
  assert.equal(parseGgejsBattleLogShortResponse('%xt%bls%opaque%0%' + JSON.stringify({ ...payload, PS: { seconds: 120 } }) + '%'), null);
  assert.equal(parseGgejsBattleLogShortResponse('%xt%bls%opaque%0%' + JSON.stringify({ ...payload, PS: '120' }) + '%').seconds_since_battle, 120);
  assert.equal(parseGgejsBattleLogShortResponse('%xt%bls%opaque%0%' + JSON.stringify({ ...payload, MID: 0 }) + '%'), null);
  assert.equal(parseGgejsBattleLogShortResponse('%xt%bls%opaque%0%' + json + '%', 'not-a-date'), null);
});

test('attaches BLS.PS time only when mailbox message, battle log and BLS target all match', () => {
  const message = {
    messageType: 6, areaType: 11, subType: 2, kingdomId: 1, ownerId: -230,
    messageId: 501, deliveryTime: new Date('2026-11-05T18:00:00Z'), hasAttackerWon: true, isForwarded: false,
  };
  const battleLog = {
    battleLogId: 9001,
    mapobject: { areaType: 11, kingdomId: 1, position: { X: 321, Y: 654 } },
    attacker: { playerId: 1234567, ownerInfo: { playerName: 'Test Attacker' } },
    defender: { playerId: -230 },
  };
  const raw = '%xt%bls%opaque%0%' + JSON.stringify({
    MID: 501, LID: 9001, PS: 90, AI: { AT: 11, K: 1, X: 321, Y: 654 },
  }) + '%';
  const shortLog = parseGgejsBattleLogShortResponse(raw, '2026-11-05T18:00:00Z');
  const evidence = extractNpcBattleReportEvidence(message, battleLog, shortLog);
  assert.equal(evidence.battle_time_estimate_utc, '2026-11-05T17:58:30.000Z');
  assert.equal(evidence.battle_time_seconds_since_battle, 90);
  assert.equal(evidence.battle_time_source, 'BLS.PS_seconds_since_battle');
  assert.equal(evidence.attack_time_utc, null);
  assert.match(evidence.time_semantics, /not the attack launch time/);

  const wrongTarget = parseGgejsBattleLogShortResponse('%xt%bls%opaque%0%' + JSON.stringify({
    MID: 501, LID: 9001, PS: 90, AI: { AT: 11, K: 1, X: 999, Y: 654 },
  }) + '%', '2026-11-05T18:00:00Z');
  const rejectedTime = extractNpcBattleReportEvidence(message, battleLog, wrongTarget);
  assert.equal(rejectedTime.battle_time_estimate_utc, null);
  assert.equal(rejectedTime.attack_time_utc, null);

  const wrongAreaType = parseGgejsBattleLogShortResponse('%xt%bls%opaque%0%' + JSON.stringify({
    MID: 501, LID: 9001, PS: 90, AI: { AT: 1, K: 1, X: 321, Y: 654 },
  }) + '%', '2026-11-05T18:00:00Z');
  assert.equal(extractNpcBattleReportEvidence(message, battleLog, wrongAreaType).battle_time_estimate_utc, null);

  const coercedBooleanAge = {
    ...shortLog,
    seconds_since_battle: true,
    battle_time_estimate_utc: '2026-11-05T17:59:59.000Z',
  };
  assert.equal(extractNpcBattleReportEvidence(message, battleLog, coercedBooleanAge).battle_time_estimate_utc, null);
  const wrongLog = { ...shortLog, battle_log_id: 9002 };
  assert.equal(extractNpcBattleReportEvidence(message, battleLog, wrongLog).battle_time_estimate_utc, null);
  const wrongMessage = { ...shortLog, message_id: 502 };
  assert.equal(extractNpcBattleReportEvidence(message, battleLog, wrongMessage).battle_time_estimate_utc, null);
});


test('parses BLM.PS using the active mailbox MID when the wire reply carries only LID', () => {
  const raw = '%xt%blm%opaque-context%0%' + JSON.stringify({ LID: 9001, PS: 91 }) + '%';
  const result = parseGgejsBattleLogMiddleTimeResponse(raw, '2026-11-05T18:00:01Z', 501);
  assert.equal(result.command, 'blm');
  assert.equal(result.source, 'BLM.PS');
  assert.equal(result.message_id, 501);
  assert.equal(result.message_id_source, 'active_mailbox_report_fetch');
  assert.equal(result.battle_log_id, 9001);
  assert.equal(result.seconds_since_battle, 91);
  assert.equal(result.battle_time_estimate_utc, '2026-11-05T17:58:30.000Z');
  assert.equal(Object.hasOwn(result, 'raw'), false);
  assert.equal(Object.hasOwn(result, 'payload'), false);
});

test('rejects BLM.PS without a correlated MID/LID, successful response and positive age', () => {
  const payload = { LID: 9001, PS: 91 };
  const json = JSON.stringify(payload);
  assert.equal(parseGgejsBattleLogMiddleTimeResponse('%xt%bls%opaque%0%' + json + '%', '2026-11-05T18:00:01Z', 501), null);
  assert.equal(parseGgejsBattleLogMiddleTimeResponse('%xt%blm%opaque%42%' + json + '%', '2026-11-05T18:00:01Z', 501), null);
  assert.equal(parseGgejsBattleLogMiddleTimeResponse('%xt%blm%opaque%0%not-json%', '2026-11-05T18:00:01Z', 501), null);
  assert.equal(parseGgejsBattleLogMiddleTimeResponse('%xt%blm%opaque%0%' + JSON.stringify({ ...payload, PS: 0 }) + '%', '2026-11-05T18:00:01Z', 501), null);
  assert.equal(parseGgejsBattleLogMiddleTimeResponse('%xt%blm%opaque%0%' + JSON.stringify({ ...payload, PS: true }) + '%', '2026-11-05T18:00:01Z', 501), null);
  assert.equal(parseGgejsBattleLogMiddleTimeResponse('%xt%blm%opaque%0%' + JSON.stringify({ ...payload, PS: [91] }) + '%', '2026-11-05T18:00:01Z', 501), null);
  assert.equal(parseGgejsBattleLogMiddleTimeResponse('%xt%blm%opaque%0%' + JSON.stringify({ ...payload, PS: { seconds: 91 } }) + '%', '2026-11-05T18:00:01Z', 501), null);
  assert.equal(parseGgejsBattleLogMiddleTimeResponse('%xt%blm%opaque%0%' + JSON.stringify({ ...payload, PS: '91' }) + '%', '2026-11-05T18:00:01Z', 501).seconds_since_battle, 91);
  assert.equal(parseGgejsBattleLogMiddleTimeResponse('%xt%blm%opaque%0%' + JSON.stringify({ ...payload, MID: 502 }) + '%', '2026-11-05T18:00:01Z', 501), null);
  assert.equal(parseGgejsBattleLogMiddleTimeResponse('%xt%blm%opaque%0%' + json + '%', '2026-11-05T18:00:01Z', null), null);
});

test('uses BLM.PS when BLS.PS is absent and the full NPC report validates the same target', () => {
  const message = {
    messageType: 6, areaType: 11, subType: 2, kingdomId: 1, ownerId: -230,
    messageId: 501, deliveryTime: new Date('2026-11-05T18:00:00Z'), hasAttackerWon: true, isForwarded: false,
  };
  const battleLog = {
    battleLogId: 9001,
    mapobject: { areaType: 11, kingdomId: 1, position: { X: 321, Y: 654 } },
    attacker: { playerId: 1234567, ownerInfo: { playerName: 'Test Attacker' } },
    defender: { playerId: -230 },
  };
  const blm = parseGgejsBattleLogMiddleTimeResponse(
    '%xt%blm%opaque%0%' + JSON.stringify({ LID: 9001, PS: 91 }) + '%',
    '2026-11-05T18:00:01Z',
    501,
  );
  const evidence = extractNpcBattleReportEvidence(message, battleLog, null, blm);
  assert.equal(evidence.battle_time_estimate_utc, '2026-11-05T17:58:30.000Z');
  assert.equal(evidence.battle_time_seconds_since_battle, 91);
  assert.equal(evidence.battle_time_source, 'BLM.PS_seconds_since_battle');
  assert.equal(evidence.attack_time_utc, null);

  const wrongMessage = { ...blm, message_id: 502 };
  assert.equal(extractNpcBattleReportEvidence(message, battleLog, null, wrongMessage).battle_time_estimate_utc, null);
  const wrongLog = { ...blm, battle_log_id: 9002 };
  assert.equal(extractNpcBattleReportEvidence(message, battleLog, null, wrongLog).battle_time_estimate_utc, null);
});

test('cross-checks BLS.PS and BLM.PS and withholds a conflicting battle-time estimate', () => {
  const message = {
    messageType: 6, areaType: 11, subType: 2, kingdomId: 1, ownerId: -230,
    messageId: 501, deliveryTime: new Date('2026-11-05T18:00:00Z'), hasAttackerWon: true, isForwarded: false,
  };
  const battleLog = {
    battleLogId: 9001,
    mapobject: { areaType: 11, kingdomId: 1, position: { X: 321, Y: 654 } },
    attacker: { playerId: 1234567, ownerInfo: { playerName: 'Test Attacker' } },
    defender: { playerId: -230 },
  };
  const bls = parseGgejsBattleLogShortResponse(
    '%xt%bls%opaque%0%' + JSON.stringify({ MID: 501, LID: 9001, PS: 90, AI: { AT: 11, K: 1, X: 321, Y: 654 } }) + '%',
    '2026-11-05T18:00:00Z',
  );
  const matchingBlm = parseGgejsBattleLogMiddleTimeResponse(
    '%xt%blm%opaque%0%' + JSON.stringify({ LID: 9001, PS: 91 }) + '%',
    '2026-11-05T18:00:01Z',
    501,
  );
  const checked = extractNpcBattleReportEvidence(message, battleLog, bls, matchingBlm);
  assert.equal(checked.battle_time_source, 'BLS.PS+BLM.PS_cross_checked');
  assert.equal(checked.battle_time_estimate_utc, '2026-11-05T17:58:30.000Z');
  assert.equal(checked.battle_time_crosscheck_delta_seconds, 0);

  const conflictingBlm = parseGgejsBattleLogMiddleTimeResponse(
    '%xt%blm%opaque%0%' + JSON.stringify({ LID: 9001, PS: 120 }) + '%',
    '2026-11-05T18:00:01Z',
    501,
  );
  const withheld = extractNpcBattleReportEvidence(message, battleLog, bls, conflictingBlm);
  assert.equal(withheld.battle_time_estimate_utc, null);
  assert.match(withheld.battle_time_rejection_reason, /differed by more than 15 seconds/);

  const wrongBlsTarget = parseGgejsBattleLogShortResponse(
    '%xt%bls%opaque%0%' + JSON.stringify({ MID: 501, LID: 9001, PS: 90, AI: { AT: 11, K: 1, X: 999, Y: 654 } }) + '%',
    '2026-11-05T18:00:00Z',
  );
  const targetConflict = extractNpcBattleReportEvidence(message, battleLog, wrongBlsTarget, matchingBlm);
  assert.equal(targetConflict.battle_time_estimate_utc, null);
  assert.match(targetConflict.battle_time_rejection_reason, /BLS.AI target disagreed/);
});
