#!/usr/bin/env node
/**
 * Read-only GGE Tracker fallback for Empirenew #baron.
 *
 * Inspired by the public GGE Assistant implementation:
 *   GET /api/v1/dungeons/meta
 *   GET /api/v1/dungeons?page=1&size=4000&filterByKid=["1"]
 *
 * This adapter is supplemental only. The IT1 catalog supplies coordinates, never live
 * PL1 state. It does not infer attack timestamps from cooldowns and does not persist data.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CATALOG_PATH = path.join(ROOT, 'data', 'baron-fortresses.json');
const BASE_URL = (process.env.GGETRACKER_BASE_URL || 'https://api.gge-tracker.com/api/v1').replace(/\/$/, '');
const SERVER = process.env.GGE_SERVER || 'E4K_PL1';
const TIMEOUT_MS = Number(process.env.BARONY_TRACKER_TIMEOUT_MS || 8000);
const KIDS = [1, 2, 3];
const KINGDOMS = { 1: 'sands', 2: 'ice', 3: 'fire' };

function isoOrNull(value) {
  if (!value || typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers = {
    Accept: 'application/json',
    'gge-server': SERVER,
    'User-Agent': 'Mozilla/5.0 (compatible; Empirenew-Barony-ReadOnly/1.0)',
  };
  if (process.env.GGETRACKER_API_KEY) headers['X-Api-Key'] = process.env.GGETRACKER_API_KEY;
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    const body = await response.text();
    let data = null;
    try { data = JSON.parse(body); } catch {}
    return {
      ok: response.ok,
      status: response.status,
      data,
      error: response.ok ? null : (isRecord(data) ? JSON.stringify(data).slice(0, 400) : body.slice(0, 400)),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  if (!Number.isInteger(TIMEOUT_MS) || TIMEOUT_MS < 1000 || TIMEOUT_MS > 30000) {
    throw new Error('BARONY_TRACKER_TIMEOUT_MS must be between 1000 and 30000.');
  }
  const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'));
  if (catalog?.server_source !== 'IT1' || catalog?.target_server !== 'E4K_PL1' || catalog?.complete !== true) {
    throw new Error('Refusing catalog: expected complete IT1 coordinates explicitly aligned to E4K_PL1.');
  }
  const targetsByKey = new Map();
  for (const kid of KIDS) {
    const group = catalog.results?.[KINGDOMS[kid]]?.fortresses;
    if (!Array.isArray(group)) throw new Error(`Catalog missing ${KINGDOMS[kid]} coordinates.`);
    for (const point of group) {
      if (point.kid !== kid || !Number.isInteger(point.x) || !Number.isInteger(point.y)) {
        throw new Error('Catalog contains invalid fortress coordinates.');
      }
      targetsByKey.set(`${kid}:${point.x}:${point.y}`, point);
    }
  }

  const sampledAt = new Date().toISOString();
  const meta = await getJson(`${BASE_URL}/dungeons/meta`);
  const kingdomResults = {};
  const liveByKey = new Map();
  for (const kid of KIDS) {
    const filter = encodeURIComponent(JSON.stringify([String(kid)]));
    const url = `${BASE_URL}/dungeons?page=1&size=4000&filterByKid=${filter}`;
    let result;
    try {
      result = await getJson(url);
    } catch (error) {
      kingdomResults[KINGDOMS[kid]] = {
        status: 'request_error',
        error_type: error?.name || 'Error',
        message: String(error?.message || error).slice(0, 240),
        rows: 0,
      };
      continue;
    }
    if (!result.ok) {
      kingdomResults[KINGDOMS[kid]] = {
        status: result.status === 400 ? 'unsupported_or_rejected_server_filter' : 'http_error',
        http_status: result.status,
        error: result.error,
        rows: 0,
      };
      continue;
    }
    const rows = Array.isArray(result.data?.dungeons) ? result.data.dungeons : null;
    if (!rows) {
      kingdomResults[KINGDOMS[kid]] = {
        status: 'unexpected_response_shape',
        http_status: result.status,
        rows: 0,
      };
      continue;
    }
    for (const row of rows) {
      const rowKid = Number(row?.kid);
      const x = Number(row?.position_x);
      const y = Number(row?.position_y);
      if (rowKid !== kid || !Number.isInteger(x) || !Number.isInteger(y)) continue;
      const key = `${kid}:${x}:${y}`;
      if (!liveByKey.has(key)) liveByKey.set(key, []);
      liveByKey.get(key).push(row);
    }
    kingdomResults[KINGDOMS[kid]] = {
      status: 'ok',
      http_status: result.status,
      rows: rows.length,
      total_count: Number.isInteger(result.data?.total_count) ? result.data.total_count : null,
    };
  }

  const observations = [];
  for (const [key, target] of targetsByKey) {
    const matches = liveByKey.get(key) || [];
    if (matches.length !== 1) {
      observations.push({
        target: { id: target.id, kid: target.kid, kingdom: target.kingdom, x: target.x, y: target.y },
        status: matches.length > 1 ? 'ambiguous_duplicate_rows' : 'not_confirmed_by_tracker',
        tracker_rows: matches.length,
        sampled_at_utc: sampledAt,
      });
      continue;
    }
    const row = matches[0];
    const cooldownUntil = isoOrNull(row.effective_cooldown_until);
    const cooldownMs = cooldownUntil ? Date.parse(cooldownUntil) : null;
    observations.push({
      target: { id: target.id, kid: target.kid, kingdom: target.kingdom, x: target.x, y: target.y },
      status: 'tracker_row_found',
      tracker_dungeon_id: row.id ?? null,
      last_king: row.last_king ?? row.player_name ?? null,
      last_attack: isoOrNull(row.last_attack),
      cooldown_until_utc: cooldownUntil,
      cooldown_active: cooldownMs === null ? null : cooldownMs > Date.parse(sampledAt),
      attack_time_utc: null,
      sampled_at_utc: sampledAt,
      note: 'last_attack is shown as source data only; it is not treated as a verified server attack timestamp.',
    });
  }

  const okKingdoms = Object.values(kingdomResults).filter((x) => x.status === 'ok').length;
  process.stdout.write(JSON.stringify({
    mode: 'gge_tracker_read_only_fallback',
    server: SERVER,
    base_url: BASE_URL,
    sampled_at_utc: sampledAt,
    meta: meta.ok ? {
      status: 'ok',
      last_scan_at: isoOrNull(meta.data?.last_scan_at),
      http_status: meta.status,
    } : {
      status: 'unavailable',
      http_status: meta.status ?? null,
      error: meta.error ?? null,
    },
    source: 'GGE Assistant public API usage pattern; independently implemented read-only adapter',
    result_status: okKingdoms === KIDS.length ? 'complete' : okKingdoms > 0 ? 'partial' : 'unavailable',
    kingdom_results: kingdomResults,
    summary: {
      catalog_targets: targetsByKey.size,
      tracker_rows_matched: observations.filter((x) => x.status === 'tracker_row_found').length,
      not_confirmed: observations.filter((x) => x.status === 'not_confirmed_by_tracker').length,
      ambiguous: observations.filter((x) => x.status === 'ambiguous_duplicate_rows').length,
      active_cooldown: observations.filter((x) => x.cooldown_active === true).length,
      cooldown_unknown: observations.filter((x) => x.status === 'tracker_row_found' && x.cooldown_active === null).length,
    },
    observations,
    persisted: false,
    warning: 'A missing tracker row or API error does not prove a fortress is absent or unavailable. This endpoint may reject PL1 or return only the tracker’s current indexed data. No attack time is inferred from cooldowns.',
  }, null, 2) + '\n');
}

main().catch((error) => {
  process.stderr.write(`GGE Tracker fallback stopped safely: ${error?.name || 'Error'}: ${error?.message || error}\n`);
  process.exitCode = 1;
});
