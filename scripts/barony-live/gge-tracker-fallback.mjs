#!/usr/bin/env node
/**
 * Read-only GGE Tracker fallback for Empirenew #baron.
 *
 * The IT1 catalog is only a coordinate index aligned to PL1 by the operator.
 * This adapter retests the public tracker for production E4K_PL1. It never
 * writes results, never treats a missing row as an absent fortress, and never
 * promotes tracker last_attack/cooldown values to a verified battle timestamp.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateMapOnlyCatalog } from './probe-core.mjs';
import {
  MAX_TRACKER_PAGES, buildTrackerObservations, countInvalidRows, getJson,
  parsePagination, validateTrackerBaseUrl,
} from './gge-tracker-fallback-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CATALOG_PATH = path.join(ROOT, 'data', 'baron-fortresses.json');
const DEFAULT_BASE_URL = 'https://api.gge-tracker.com/api/v1';
const SERVER = process.env.GGE_SERVER || 'E4K_PL1';
const TIMEOUT_MS = Number(process.env.BARONY_TRACKER_TIMEOUT_MS || 8000);
const PAGE_SIZE = 4000;
const KIDS = [1, 2, 3];
const KINGDOMS = { 1: 'sands', 2: 'ice', 3: 'fire' };

function isoOrNull(value) {
  if (typeof value !== 'string' || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function endpointUrl(baseUrl, endpoint, params = {}) {
  const url = new URL(`${baseUrl}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url.toString();
}

async function fetchKingdom(kid, baseUrl, requestOptions) {
  const allRows = [];
  let expectedPages = null;
  let expectedTotal = null;

  for (let page = 1; page <= MAX_TRACKER_PAGES; page += 1) {
    const filter = JSON.stringify([String(kid)]);
    const url = endpointUrl(baseUrl, 'dungeons', {
      page,
      size: PAGE_SIZE,
      filterByKid: filter,
    });
    const result = await getJson(url, requestOptions);
    if (!result.ok) {
      return {
        status: result.status === 400 ? 'unsupported_or_rejected_server_filter' : result.error,
        http_status: result.status,
        error_type: result.error_type ?? null,
        rows: allRows.length,
        sampled_at_utc: new Date().toISOString(),
      };
    }

    const rows = Array.isArray(result.data?.dungeons) ? result.data.dungeons : null;
    if (!rows) {
      return {
        status: 'unexpected_response_shape',
        http_status: result.status,
        rows: allRows.length,
        sampled_at_utc: new Date().toISOString(),
      };
    }

    const pagination = parsePagination(result.data, rows, page, MAX_TRACKER_PAGES);
    if (!pagination.ok) {
      return {
        status: pagination.status,
        http_status: result.status,
        rows: allRows.length + rows.length,
        sampled_at_utc: new Date().toISOString(),
      };
    }

    if (expectedPages === null) {
      expectedPages = pagination.total_pages;
      expectedTotal = pagination.total_items_count;
    } else if (
      pagination.total_pages !== expectedPages ||
      pagination.total_items_count !== expectedTotal
    ) {
      return {
        status: 'pagination_changed_during_read',
        http_status: result.status,
        rows: allRows.length + rows.length,
        sampled_at_utc: new Date().toISOString(),
      };
    }

    allRows.push(...rows);
    if (page === expectedPages) {
      if (allRows.length !== expectedTotal) {
        return {
          status: 'total_count_mismatch',
          http_status: result.status,
          rows: allRows.length,
          total_count: expectedTotal,
          sampled_at_utc: new Date().toISOString(),
        };
      }
      const invalidRows = countInvalidRows(allRows, kid);
      if (invalidRows > 0) {
        return {
          status: 'invalid_rows',
          http_status: result.status,
          rows: allRows.length,
          invalid_rows: invalidRows,
          sampled_at_utc: new Date().toISOString(),
        };
      }
      return {
        status: 'complete',
        http_status: result.status,
        rows: allRows,
        total_count: expectedTotal,
        sampled_at_utc: new Date().toISOString(),
      };
    }
  }

  return {
    status: 'pagination_limit_exceeded',
    rows: allRows.length,
    sampled_at_utc: new Date().toISOString(),
  };
}

async function run() {
  if (!Number.isInteger(TIMEOUT_MS) || TIMEOUT_MS < 1000 || TIMEOUT_MS > 30000) {
    throw new Error('BARONY_TRACKER_TIMEOUT_MS must be between 1000 and 30000.');
  }
  if (SERVER !== 'E4K_PL1') {
    throw new Error('This production fallback accepts only GGE_SERVER=E4K_PL1; Beta data must not be used as PL1.');
  }

  const baseUrl = validateTrackerBaseUrl(process.env.GGETRACKER_BASE_URL || DEFAULT_BASE_URL);
  const apiKey = process.env.GGETRACKER_API_KEY || '';
  if (apiKey && new URL(baseUrl).hostname !== 'api.gge-tracker.com') {
    throw new Error('Refusing to send GGETRACKER_API_KEY to a non-GGE-Tracker host.');
  }

  const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'));
  if (catalog?.target_server !== 'E4K_PL1' ||
      typeof catalog?.coordinate_alignment !== 'string' ||
      !catalog.coordinate_alignment.startsWith('operator_confirmed')) {
    throw new Error('Refusing catalog: expected IT1 coordinates explicitly aligned to production E4K_PL1.');
  }
  const groups = validateMapOnlyCatalog(catalog);
  const targets = Object.values(groups).flat();
  const requestOptions = { server: SERVER, apiKey, timeoutMs: TIMEOUT_MS };

  const metaResult = await getJson(endpointUrl(baseUrl, 'dungeons/meta'), requestOptions);
  const meta = metaResult.ok ? {
    status: 'ok',
    last_scan_at: isoOrNull(metaResult.data?.last_scan_at),
    http_status: metaResult.status,
  } : {
    status: 'unavailable',
    http_status: metaResult.status,
    error: metaResult.error,
  };

  const kingdomResults = {};
  for (const kid of KIDS) {
    kingdomResults[KINGDOMS[kid]] = await fetchKingdom(kid, baseUrl, requestOptions);
  }

  const observations = buildTrackerObservations(targets, kingdomResults);
  const completeKingdoms = Object.values(kingdomResults).filter((result) => result.status === 'complete').length;
  const anyRows = Object.values(kingdomResults).some((result) => result.rows > 0);
  const resultStatus = completeKingdoms === KIDS.length ? 'complete'
    : completeKingdoms > 0 || anyRows ? 'partial' : 'unavailable';

  const publicKingdomResults = Object.fromEntries(Object.entries(kingdomResults).map(([kingdom, result]) => [
    kingdom,
    {
      status: result.status,
      http_status: result.http_status ?? null,
      rows: result.rows ?? 0,
      total_count: result.total_count ?? null,
      invalid_rows: result.invalid_rows ?? 0,
      sampled_at_utc: result.sampled_at_utc ?? null,
      error_type: result.error_type ?? null,
    },
  ]));

  process.stdout.write(JSON.stringify({
    mode: 'gge_tracker_read_only_fallback',
    server: SERVER,
    base_url: baseUrl,
    sampled_at_utc: new Date().toISOString(),
    meta,
    source: 'GGE Assistant public API usage pattern; independently implemented read-only adapter',
    result_status: resultStatus,
    kingdom_results: publicKingdomResults,
    summary: {
      catalog_targets: targets.length,
      tracker_rows_matched: observations.filter((item) => item.status === 'tracker_row_found').length,
      not_confirmed: observations.filter((item) => item.status === 'not_confirmed_by_tracker').length,
      ambiguous: observations.filter((item) => item.status === 'ambiguous_duplicate_rows').length,
      source_unavailable: observations.filter((item) => item.status === 'source_unavailable').length,
    },
    observations,
    persisted: false,
    warning: 'A missing tracker row or API error does not prove a fortress is absent. Pagination must be complete for a kingdom before a missing row is reported. Tracker actor/last_attack fields are unverified; attack_time_utc remains null. No Beta data is accepted by this production-only probe.',
  }, null, 2) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    process.stderr.write(`GGE Tracker fallback stopped safely: ${error?.name || 'Error'}: ${error?.message || error}\n`);
    process.exitCode = 1;
  });
}
