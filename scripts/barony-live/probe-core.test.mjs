import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildObservation, buildScanPlan, compareObservations, extractNpcBattleReportEvidence, pickSamples, validateMapOnlyCatalog,
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

test('accepts only complete IT1 map-only data', () => {
  assert.equal(Object.values(validateMapOnlyCatalog(catalog())).flat().length, 9);
});

test('rejects Beta or attack-state fields in the coordinate catalog', () => {
  const beta = catalog(); beta.server_source = 'E4K_PL1_BETA';
  assert.throws(() => validateMapOnlyCatalog(beta), /IT1/);
  const polluted = catalog(); polluted.results.sands.fortresses[0].last_attack = '2026-11-05T00:00:00Z';
  assert.throws(() => validateMapOnlyCatalog(polluted), /attack\/player state/);
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
  assert.equal(buildObservation(target, rows).status, 'coordinate_row_unverified');
});

test('reports no row as not confirmed, not as an attack', () => {
  const target = { id: 'it1-1-10-20', kid: 1, kingdom: 'sands', x: 10, y: 20 };
  const observation = buildObservation(target, [], '2026-11-05T15:00:00Z');
  assert.equal(observation.status, 'not_confirmed');
  assert.equal(observation.attack_time_utc, null);
});

test('reports defeater and cooldown transitions only as unvalidated target-specific candidates', () => {
  const previous = {
    status: 'fortress_row_found', sampled_at_utc: '2026-11-05T15:00:00Z',
    target: { kid: 1, x: 10, y: 20 }, defeater_player_id: 111, cooldown_active: false,
  };
  const current = {
    status: 'fortress_row_found', sampled_at_utc: '2026-11-05T15:10:00Z',
    target: previous.target, defeater_player_id: 222, cooldown_active: true,
  };
  const signals = compareObservations(previous, current);
  assert.deepEqual(signals.map((s) => s.kind), ['target_defeater_id_changed', 'target_cooldown_started']);
  assert.ok(signals.every((s) => s.classification.includes('candidate_target_specific')));
  assert.equal(signals[0].metric, 'BossDungeonMapobject.defeaterPlayerId');
  assert.equal(signals[0].player_id, 222);
  assert.equal(signals[0].interval_start_utc, previous.sampled_at_utc);
  assert.equal(signals[0].interval_end_utc, current.sampled_at_utc);
});

test('does not create signals from missing or unverified previous samples', () => {
  const current = { status: 'fortress_row_found', defeater_player_id: 123456, cooldown_active: true };
  assert.deepEqual(compareObservations(null, current), []);
  assert.deepEqual(compareObservations({ status: 'not_confirmed' }, current), []);
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


test('extracts exact target and attacker from a matching NPC boss-dungeon battle report', () => {
  const message = {
    messageType: 6, areaType: 11, subType: 2, kingdomId: 1, ownerId: -230,
    messageId: 501, deliveryTime: new Date('2026-11-05T18:00:00Z'), hasAttackerWon: true,
  };
  const battleLog = {
    battleLogId: 9001,
    mapobject: { areaType: 11, kingdomId: 1, position: { X: 321, Y: 654 } },
    attacker: { playerId: 1234567 },
    defender: { playerId: -230 },
  };
  const evidence = extractNpcBattleReportEvidence(message, battleLog);
  assert.deepEqual(evidence.target, { kid: 1, kingdom: 'sands', x: 321, y: 654, area_type: 11, owner_id: -230 });
  assert.equal(evidence.attacker_player_id, 1234567);
  assert.equal(evidence.outcome, 'attacker_won');
  assert.equal(evidence.report_received_at_utc, '2026-11-05T18:00:00.000Z');
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
