export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
export const MAX_TRACKER_PAGES = 20;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeInteger(value) {
  if (Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function validateTrackerBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Invalid GGE Tracker base URL.');
  }
  if (!['https:', 'http:'].includes(parsed.protocol) ||
      parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('GGE Tracker base URL must be HTTP(S) without credentials, query or fragment.');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed.toString().replace(/\/$/, '');
}

export async function readBoundedResponseText(response, maxBytes = MAX_RESPONSE_BYTES) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid response size limit.');
  const declared = response?.headers?.get?.('content-length');
  if (declared !== null && declared !== undefined) {
    if (!/^\d+$/.test(String(declared).trim())) throw codedError('invalid_content_length');
    if (Number(declared) > maxBytes) throw codedError('response_too_large');
  }
  const reader = response?.body?.getReader?.();
  if (!reader) throw codedError('missing_response_body');

  const chunks = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch {}
      throw codedError('response_too_large');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw codedError('invalid_utf8');
  }
}

export async function getJson(url, {
  fetchImpl = globalThis.fetch,
  server = 'E4K_PL1',
  apiKey = '',
  timeoutMs = 8000,
  maxResponseBytes = MAX_RESPONSE_BYTES,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
    throw new Error('Timeout must be between 1000 and 30000 ms.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    Accept: 'application/json',
    'gge-server': server,
    'User-Agent': 'Empirenew-readonly-provider-probe/1.0',
  };
  if (apiKey) headers['X-Api-Key'] = apiKey;
  let response;
  try {
    response = await fetchImpl(url, { headers, signal: controller.signal });
    if (!response.ok) {
      return { ok: false, status: response.status, error: 'upstream_http_error' };
    }
    const body = await readBoundedResponseText(response, maxResponseBytes);
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      return { ok: false, status: response.status, error: 'invalid_json' };
    }
    return { ok: true, status: response.status, data, error: null };
  } catch (error) {
    const known = new Set([
      'response_too_large', 'invalid_content_length', 'invalid_utf8',
      'missing_response_body',
    ]);
    const code = known.has(error?.code) ? error.code
      : error?.name === 'AbortError' ? 'timeout' : 'request_error';
    return {
      ok: false,
      status: response?.status ?? null,
      error: code,
      error_type: error?.name || 'Error',
    };
  } finally {
    clearTimeout(timer);
  }
}

export function parsePagination(payload, rows, requestedPage, maxPages = MAX_TRACKER_PAGES) {
  const pagination = payload?.pagination;
  if (!isRecord(pagination)) return { ok: false, status: 'pagination_missing' };
  const currentPage = safeInteger(pagination.current_page ?? pagination.currentPage ?? pagination.page);
  const totalPages = safeInteger(pagination.total_pages ?? pagination.totalPages);
  const currentItems = safeInteger(pagination.current_items_count ?? pagination.currentItemsCount);
  const totalItems = safeInteger(pagination.total_items_count ?? pagination.totalItemsCount);

  if ([currentPage, totalPages, currentItems, totalItems].some((value) => value === null)) {
    return { ok: false, status: 'pagination_invalid' };
  }
  if (currentPage !== requestedPage) return { ok: false, status: 'unexpected_page_number' };
  if (totalPages < 1 || totalPages > maxPages || currentPage > totalPages) {
    return { ok: false, status: 'pagination_limit_or_range_error' };
  }
  if (currentItems !== rows.length || totalItems < currentItems) {
    return { ok: false, status: 'page_item_count_mismatch' };
  }
  return {
    ok: true,
    current_page: currentPage,
    total_pages: totalPages,
    current_items_count: currentItems,
    total_items_count: totalItems,
  };
}

export function countInvalidRows(rows, expectedKid) {
  return rows.reduce((count, row) => {
    if (!isRecord(row)) return count + 1;
    const kid = safeInteger(row.kid);
    const x = safeInteger(row.position_x ?? row.x);
    const y = safeInteger(row.position_y ?? row.y);
    if (kid !== expectedKid || x === null || y === null || x < 0 || x > 1286 || y < 0 || y > 1286) {
      return count + 1;
    }
    return count;
  }, 0);
}

function isoOrNull(value) {
  if (typeof value !== 'string' || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function safeLabel(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : null;
}

export function buildTrackerObservations(targets, kingdomResults) {
  const rowsByKingdom = new Map();
  for (const [kingdom, result] of Object.entries(kingdomResults)) {
    if (!result || result.status !== 'complete' || !Array.isArray(result.rows)) continue;
    const kid = ({ sands: 1, ice: 2, fire: 3 })[kingdom];
    const index = new Map();
    for (const row of result.rows) {
      if (!isRecord(row)) continue;
      const rowKid = safeInteger(row.kid);
      const x = safeInteger(row.position_x ?? row.x);
      const y = safeInteger(row.position_y ?? row.y);
      if (rowKid !== kid || x === null || y === null) continue;
      const key = `${kid}:${x}:${y}`;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(row);
    }
    rowsByKingdom.set(kingdom, index);
  }

  return targets.map((target) => {
    const result = kingdomResults[target.kingdom];
    const base = {
      target: { id: target.id, kid: target.kid, kingdom: target.kingdom, x: target.x, y: target.y },
      sampled_at_utc: result?.sampled_at_utc ?? null,
      attack_time_utc: null,
    };
    if (!result || result.status !== 'complete') {
      return {
        ...base,
        status: 'source_unavailable',
        source_status: result?.status ?? 'not_requested',
        tracker_rows: 0,
      };
    }
    const matches = rowsByKingdom.get(target.kingdom)?.get(`${target.kid}:${target.x}:${target.y}`) || [];
    if (matches.length === 0) return { ...base, status: 'not_confirmed_by_tracker', tracker_rows: 0 };
    if (matches.length > 1) return { ...base, status: 'ambiguous_duplicate_rows', tracker_rows: matches.length };

    const row = matches[0];
    const cooldownUntil = isoOrNull(row.effective_cooldown_until);
    const sampledMs = Date.parse(base.sampled_at_utc || '');
    const cooldownMs = cooldownUntil ? Date.parse(cooldownUntil) : NaN;
    const playerId = safeInteger(row.player_id);
    return {
      ...base,
      status: 'tracker_row_found',
      tracker_dungeon_id: row.id === undefined || row.id === null ? null : String(row.id).slice(0, 80),
      tracker_reported_player_id: playerId !== null && playerId > 0 ? playerId : null,
      tracker_reported_actor_label: safeLabel(row.last_king ?? row.player_name),
      tracker_reported_last_attack_utc: isoOrNull(row.last_attack),
      cooldown_until_utc: cooldownUntil,
      cooldown_active: Number.isFinite(sampledMs) && Number.isFinite(cooldownMs) ? cooldownMs > sampledMs : null,
      note: 'Tracker last_attack/actor fields are unverified source data; attack_time_utc is intentionally null.',
    };
  });
}
