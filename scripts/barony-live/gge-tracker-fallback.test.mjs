import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTrackerObservations, countInvalidRows, getJson, parsePagination,
  readBoundedResponseText, validateTrackerBaseUrl,
} from './gge-tracker-fallback-core.mjs';

test('rejects tracker base URLs with credentials, query strings or fragments', () => {
  assert.throws(() => validateTrackerBaseUrl('https://user:pass@example.test/api'), /without credentials/);
  assert.throws(() => validateTrackerBaseUrl('https://example.test/api?token=secret'), /without credentials/);
  assert.throws(() => validateTrackerBaseUrl('https://example.test/api#secret'), /without credentials/);
  assert.equal(validateTrackerBaseUrl('https://example.test/api/'), 'https://example.test/api');
});

test('bounds declared and streamed response sizes', async () => {
  const declared = new Response('x', {
    status: 200,
    headers: { 'content-length': '4' },
  });
  await assert.rejects(readBoundedResponseText(declared, 3), (error) => error.code === 'response_too_large');

  const streamed = new Response('abcd', { status: 200 });
  await assert.rejects(readBoundedResponseText(streamed, 3), (error) => error.code === 'response_too_large');
});

test('rejects malformed content length and invalid UTF-8', async () => {
  const malformed = new Response('x', {
    status: 200,
    headers: { 'content-length': 'unknown' },
  });
  await assert.rejects(readBoundedResponseText(malformed, 10), (error) => error.code === 'invalid_content_length');

  const invalidUtf8 = new Response(new Uint8Array([0xc3, 0x28]), { status: 200 });
  await assert.rejects(readBoundedResponseText(invalidUtf8, 10), (error) => error.code === 'invalid_utf8');
});

test('does not copy upstream HTTP error bodies into diagnostics', async () => {
  const result = await getJson('https://example.test/dungeons', {
    fetchImpl: async () => new Response('private-player-name-and-token', { status: 400 }),
  });
  assert.deepEqual(result, { ok: false, status: 400, error: 'upstream_http_error' });
  assert.doesNotMatch(JSON.stringify(result), /private-player-name|token/);
});

test('requires exact and internally consistent pagination metadata', () => {
  const rows = [{ kid: 1, position_x: 10, position_y: 20 }];
  const good = {
    pagination: {
      current_page: 1,
      total_pages: 1,
      current_items_count: 1,
      total_items_count: 1,
    },
  };
  assert.deepEqual(parsePagination(good, rows, 1), {
    ok: true,
    current_page: 1,
    total_pages: 1,
    current_items_count: 1,
    total_items_count: 1,
  });
  assert.equal(parsePagination({}, rows, 1).status, 'pagination_missing');
  assert.equal(parsePagination(good, [], 1).status, 'page_item_count_mismatch');
  assert.equal(parsePagination({ pagination: { ...good.pagination, current_page: 2 } }, rows, 1).status, 'unexpected_page_number');
  assert.equal(parsePagination({ pagination: { ...good.pagination, total_pages: 21 } }, rows, 1).status, 'pagination_limit_or_range_error');
});

test('rejects malformed or cross-kingdom rows instead of treating them as a complete sample', () => {
  const rows = [
    { kid: 1, position_x: 10, position_y: 20 },
    { kid: 2, position_x: 11, position_y: 21 },
    { kid: 1, position_x: -1, position_y: 22 },
    null,
  ];
  assert.equal(countInvalidRows(rows, 1), 3);
});

test('matches exact coordinates and never promotes tracker timestamps to attack_time_utc', () => {
  const targets = [
    { id: 'it1-1-10-20', kid: 1, kingdom: 'sands', x: 10, y: 20 },
    { id: 'it1-1-11-21', kid: 1, kingdom: 'sands', x: 11, y: 21 },
  ];
  const kingdomResults = {
    sands: {
      status: 'complete',
      sampled_at_utc: '2026-11-06T18:00:00.000Z',
      rows: [{
        id: 7, kid: 1, position_x: 10, position_y: 20,
        player_id: 123, player_name: 'sample-player',
        last_attack: '2026-11-06T17:00:00.000Z',
      }],
    },
  };
  const [found, missing] = buildTrackerObservations(targets, kingdomResults);
  assert.equal(found.status, 'tracker_row_found');
  assert.equal(found.tracker_reported_player_id, 123);
  assert.equal(found.tracker_reported_actor_label, 'sample-player');
  assert.equal(found.tracker_reported_last_attack_utc, '2026-11-06T17:00:00.000Z');
  assert.equal(found.attack_time_utc, null);
  assert.equal(missing.status, 'not_confirmed_by_tracker');
  assert.equal(missing.attack_time_utc, null);
});

test('marks duplicate coordinates ambiguous and incomplete sources unavailable', () => {
  const targets = [
    { id: 'it1-1-10-20', kid: 1, kingdom: 'sands', x: 10, y: 20 },
    { id: 'it1-2-30-40', kid: 2, kingdom: 'ice', x: 30, y: 40 },
  ];
  const results = {
    sands: {
      status: 'complete',
      sampled_at_utc: '2026-11-06T18:00:00.000Z',
      rows: [
        { kid: 1, position_x: 10, position_y: 20 },
        { kid: 1, position_x: 10, position_y: 20 },
      ],
    },
    ice: { status: 'pagination_missing', sampled_at_utc: null, rows: [] },
  };
  const [duplicate, unavailable] = buildTrackerObservations(targets, results);
  assert.equal(duplicate.status, 'ambiguous_duplicate_rows');
  assert.equal(unavailable.status, 'source_unavailable');
  assert.equal(unavailable.source_status, 'pagination_missing');
});
