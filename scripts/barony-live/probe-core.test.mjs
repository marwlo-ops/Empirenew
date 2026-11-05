import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildObservation, buildScanPlan, compareObservations, pickSamples, validateMapOnlyCatalog,
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

test('accepts only a DUNGEON row with the expected kingdom NPC owner', () => {
  const target = { id: 'it1-1-10-20', kid: 1, kingdom: 'sands', x: 10, y: 20 };
  const row = {
    areaType: 2, kingdomId: 1, attackCount: 12, position: { X: 10, Y: 20 },
    ownerInfo: { playerId: -220 }, attackCooldownEnd: new Date('2026-11-05T16:00:00Z'),
  };
  const observation = buildObservation(target, [row], '2026-11-05T15:00:00Z');
  assert.equal(observation.status, 'fortress_row_found');
  assert.equal(observation.owner_id, -220);
  assert.equal(observation.attack_count, 12);
  assert.equal(observation.cooldown_active, true);
  assert.equal(observation.attack_time_utc, null);
});

test('does not accept a player castle or wrong NPC owner at the same coordinates', () => {
  const target = { id: 'it1-1-10-20', kid: 1, kingdom: 'sands', x: 10, y: 20 };
  const rows = [
    { areaType: 1, kingdomId: 1, position: { X: 10, Y: 20 }, ownerInfo: { playerId: 123 } },
    { areaType: 2, kingdomId: 1, position: { X: 10, Y: 20 }, ownerInfo: { playerId: -221 } },
  ];
  assert.equal(buildObservation(target, rows).status, 'coordinate_row_unverified');
});

test('reports no row as not confirmed, not as an attack', () => {
  const target = { id: 'it1-1-10-20', kid: 1, kingdom: 'sands', x: 10, y: 20 };
  const observation = buildObservation(target, [], '2026-11-05T15:00:00Z');
  assert.equal(observation.status, 'not_confirmed');
  assert.equal(observation.attack_time_utc, null);
});

test('reports counter and cooldown transitions only as unvalidated candidate signals', () => {
  const previous = {
    status: 'fortress_row_found', sampled_at_utc: '2026-11-05T15:00:00Z',
    target: { kid: 1, x: 10, y: 20 }, attack_count: 12, cooldown_active: false,
  };
  const current = {
    status: 'fortress_row_found', sampled_at_utc: '2026-11-05T15:10:00Z',
    target: previous.target, attack_count: 13, cooldown_active: true,
  };
  const signals = compareObservations(previous, current);
  assert.deepEqual(signals.map((s) => s.kind), ['attack_count_increased', 'target_cooldown_started']);
  assert.ok(signals.every((s) => s.classification === 'candidate_signal_not_yet_live_validated'));
  assert.equal(signals[0].interval_start_utc, previous.sampled_at_utc);
  assert.equal(signals[0].interval_end_utc, current.sampled_at_utc);
});

test('maps all three kingdom dungeon owners to their exact KID', () => {
  for (const [kid, kingdom, ownerId] of [[1, 'sands', -220], [2, 'ice', -221], [3, 'fire', -222]]) {
    const target = { id: `it1-${kid}-40-50`, kid, kingdom, x: 40, y: 50 };
    const row = { areaType: 2, kingdomId: kid, position: { X: 40, Y: 50 }, ownerInfo: { playerId: ownerId }, attackCount: 0 };
    assert.equal(buildObservation(target, [row]).status, 'fortress_row_found');
  }
});

test('does not create signals from missing or unverified previous samples', () => {
  const current = { status: 'fortress_row_found', attack_count: 13, cooldown_active: true };
  assert.deepEqual(compareObservations(null, current), []);
  assert.deepEqual(compareObservations({ status: 'not_confirmed' }, current), []);
});
