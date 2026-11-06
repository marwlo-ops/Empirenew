#!/usr/bin/env node
/**
 * Read-only fortress radar compatible with the server header used by GGE Assistant.
 * Default server is the observed E4K_PL1_BETA. It reports source cooldown only;
 * it never invents an attack timestamp.
 */
import { writeFile } from 'node:fs/promises';
import {
  MAX_TRACKER_PAGES, getJson, parsePagination, countInvalidRows,
} from './gge-tracker-fallback-core.mjs';

const BASE = 'https://api.gge-tracker.com/api/v1';
const SERVER = process.env.GGE_SERVER || 'E4K_PL1_BETA';
const PLAYER = (process.env.BARONY_PLAYER_NAME || '').trim();
const API_KEY = process.env.GGETRACKER_API_KEY || '';
const TIMEOUT = Number(process.env.BARONY_TRACKER_TIMEOUT_MS || 10000);
const KIDS = { 1: 'sands', 2: 'ice', 3: 'fire' };

function urlFor(path, params = {}) {
  const u = new URL(BASE + '/' + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return u.toString();
}
function isoOrNull(v) {
  if (typeof v !== 'string' || !v) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
async function fetchKingdom(kid) {
  const rows = [];
  let totalPages = null, totalItems = null;
  for (let page = 1; page <= MAX_TRACKER_PAGES; page++) {
    const filter = JSON.stringify([String(kid)]);
    const encodedPlayer = PLAYER;
    const result = await getJson(urlFor('dungeons', { page, size: 2000, filterByKid: filter, filterByPlayerName: encodedPlayer, nearPlayerName: encodedPlayer }), {
      server: SERVER, apiKey: API_KEY, timeoutMs: TIMEOUT,
    });
    if (!result.ok) return { status: result.status === 400 ? 'unsupported_or_rejected_server' : result.error,
      http_status: result.status, rows: rows.length, sampled_at: new Date().toISOString() };
    const batch = result.data?.dungeons;
    if (!Array.isArray(batch)) return { status: 'unexpected_response_shape', rows: rows.length };
    const pagination = parsePagination(result.data, batch, page, MAX_TRACKER_PAGES);
    if (!pagination.ok) return { status: pagination.status, rows: rows.length + batch.length };
    if (totalPages === null) { totalPages = pagination.total_pages; totalItems = pagination.total_items_count; }
    if (pagination.total_pages !== totalPages || pagination.total_items_count !== totalItems) {
      return { status: 'pagination_changed_during_read', rows: rows.length + batch.length };
    }
    rows.push(...batch);
    if (page === totalPages) {
      if (rows.length !== totalItems) return { status: 'total_count_mismatch', rows: rows.length, total_count: totalItems };
      const invalid = countInvalidRows(rows, kid);
      if (invalid) return { status: 'invalid_rows', rows: rows.length, invalid_rows: invalid };
      const now = Date.now();
      const targets = rows.map(d => {
        const x = Number(d.position_x ?? d.x), y = Number(d.position_y ?? d.y);
        const cooldownUntil = isoOrNull(d.effective_cooldown_until);
        const remaining = cooldownUntil ? Math.max(0, Math.ceil((Date.parse(cooldownUntil) - now) / 1000)) : 0;
        return {
          kid, kingdom: KIDS[kid], x, y,
          player_name: typeof d.player_name === 'string' ? d.player_name : null,
          cooldown_until: cooldownUntil,
          seconds_remaining: remaining,
          status: remaining > 0 ? 'locked' : 'available',
          source_last_attack: isoOrNull(d.last_attack),
        };
      }).filter(d => d.status === 'available' || d.seconds_remaining <= 3600);
      return { status: 'complete', total_count: totalItems, rows: targets, sampled_at: new Date().toISOString() };
    }
  }
  return { status: 'pagination_limit_exceeded', rows: rows.length };
}
async function main() {
  if (!PLAYER) throw new Error('Set BARONY_PLAYER_NAME to the exact in-game player name used with /fortress scan.');
  if (!Number.isInteger(TIMEOUT) || TIMEOUT < 1000 || TIMEOUT > 30000) throw new Error('Invalid timeout.');
  const metaResult = await getJson(urlFor('dungeons/meta'), { server: SERVER, apiKey: API_KEY, timeoutMs: TIMEOUT });
  const kingdoms = {};
  for (const kid of [1, 2, 3]) kingdoms[KIDS[kid]] = await fetchKingdom(kid);
  const complete = Object.values(kingdoms).every(x => x.status === 'complete');
  const rows = Object.values(kingdoms).flatMap(x => x.status === 'complete' ? x.rows : []);
  const result = {
    schema_version: 1, source: 'GGE Assistant fortress radar logic / GGE Tracker API',
    server: SERVER, player: PLAYER, sampled_at: new Date().toISOString(),
    last_api_scan_at: metaResult.ok ? isoOrNull(metaResult.data?.last_scan_at) : null,
    meta_status: metaResult.ok ? 'ok' : (metaResult.error || 'unavailable'),
    result_status: complete ? 'complete' : (rows.length ? 'partial' : 'unavailable'),
    kingdoms: Object.fromEntries(Object.entries(kingdoms).map(([name, value]) => [name, {
      status: value.status, total_count: value.total_count ?? null, rows: value.rows?.length ?? value.rows ?? 0,
      sampled_at: value.sampled_at ?? null,
    }])),
    targets: rows.sort((a,b) => a.kid-b.kid || a.x-b.x || a.y-b.y),
    disclaimer: 'Locked/available status is based on effective_cooldown_until from GGE Tracker. source_last_attack is unverified metadata and is not treated as confirmed attack history.',
  };
  const output = JSON.stringify(result, null, 2) + '\n';
  if (process.env.BARONY_RADAR_OUTPUT) await writeFile(process.env.BARONY_RADAR_OUTPUT, output, 'utf8');
  process.stdout.write(output);
  if (!complete) process.exitCode = 2;
}
main().catch(e => { process.stderr.write('Fortress radar failed safely: ' + (e?.message || e) + '\n'); process.exitCode = 1; });
