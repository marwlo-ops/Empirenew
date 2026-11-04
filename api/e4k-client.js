/**
 * Empirenew — read-only E4K PL1 API adapter.
 *
 * Confirmed request shapes from the existing PL1 collector:
 *   ain: /{server}/ain/%22AID%22:{aid}
 *   hgh: /{server}/hgh/{URL-encoded JSON {"LT":11,"LID":1,"SV":"5"}}
 *
 * Keep this adapter read-only. Never send credentials, cookies or game tokens.
 */
export const DEFAULT_SERVER = "EmpirefourkingdomsExGG2_3";
export const DEFAULT_API_BASE = "https://empire-api.fly.dev";

export class E4KApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "E4KApiError";
    this.details = details;
  }
}

function assertSuccess(payload, command) {
  if (!payload || typeof payload !== "object") {
    throw new E4KApiError(`${command}: odpowiedź nie jest obiektem JSON`, { payload });
  }
  if (String(payload.return_code ?? payload.status) !== "0") {
    throw new E4KApiError(`${command}: API zwróciło return_code=${payload.return_code ?? "brak"}`, {
      command, return_code: payload.return_code, error: payload.error
    });
  }
  return payload;
}

export function normalizePosition(tuple) {
  if (!Array.isArray(tuple) || tuple.length < 5) return null;
  const [kingdom_code, object_id, x, y, type_code] = tuple;
  if (![kingdom_code, object_id, x, y, type_code].every(v => Number.isFinite(Number(v)))) return null;
  return {
    kingdom_code: Number(kingdom_code),
    object_id: Number(object_id),
    x: Number(x),
    y: Number(y),
    type_code: Number(type_code)
  };
}

export function normalizeMember(raw, aid, allianceName) {
  if (!raw || typeof raw !== "object") return null;
  const id = raw.OID ?? raw.OID1 ?? raw.PID ?? raw.id ?? raw.ID;
  const name = raw.N ?? raw.PN ?? raw.name ?? raw.NAME;
  if (id == null || name == null) return null;
  const positions = value => Array.isArray(value)
    ? value.map(normalizePosition).filter(Boolean)
    : [];
  return {
    member_id: Number(id),
    name: String(name),
    alliance_id: Number(aid),
    alliance_name: String(allianceName || `AID_${aid}`),
    ap: positions(raw.AP),
    vp: positions(raw.VP),
    raw
  };
}

async function request(command, params, options = {}) {
  const base = (options.baseUrl || DEFAULT_API_BASE).replace(/\/$/, "");
  const server = options.server || DEFAULT_SERVER;
  const encoded = command === "ain"
    ? `%22AID%22:${encodeURIComponent(String(params.AID))}`
    : encodeURIComponent(JSON.stringify(params));
  const url = `${base}/${encodeURIComponent(server)}/${command}/${encoded}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: options.signal
  });
  if (!response.ok) {
    throw new E4KApiError(`${command}: HTTP ${response.status}`, { url, status: response.status });
  }
  let payload;
  try { payload = await response.json(); }
  catch (error) { throw new E4KApiError(`${command}: niepoprawny JSON`, { url, cause: String(error) }); }
  return assertSuccess(payload, command);
}

/** Pobiera roster sojuszu i normalizuje AP/VP do schematu mapy Empirenew. */
export async function fetchAlliance(aid, options = {}) {
  if (!Number.isInteger(Number(aid)) || Number(aid) <= 0) {
    throw new TypeError("AID musi być dodatnią liczbą całkowitą");
  }
  const payload = await request("ain", { AID: Number(aid) }, options);
  const content = payload.content || {};
  const alliance = content.A && typeof content.A === "object" ? content.A : content;
  const rawMembers = alliance.M ?? alliance.ML ?? alliance.members ?? [];
  const members = (Array.isArray(rawMembers) ? rawMembers : Object.values(rawMembers))
    .map(member => normalizeMember(member, aid, alliance.N ?? alliance.AN ?? alliance.name))
    .filter(Boolean);
  if (!members.length) {
    throw new E4KApiError("ain: odpowiedź nie zawiera rozpoznawalnej listy członków", {
      aid, contentKeys: Object.keys(content), allianceKeys: Object.keys(alliance)
    });
  }
  const ap = members.reduce((n, member) => n + member.ap.length, 0);
  const vp = members.reduce((n, member) => n + member.vp.length, 0);
  return {
    schema_version: 1,
    captured_at: new Date().toISOString(),
    server: options.server || DEFAULT_SERVER,
    alliance: { name: alliance.N ?? alliance.AN ?? alliance.name ?? `AID_${aid}`, aid: Number(aid) },
    source: `${(options.baseUrl || DEFAULT_API_BASE).replace(/\/$/, "")}/${options.server || DEFAULT_SERVER}/ain/%22AID%22:${aid}`,
    tuple_format: ["kingdom_code", "object_id", "x", "y", "type_code"],
    counts: { members: members.length, ap_positions: ap, vp_positions: vp },
    members
  };
}

/** Pobiera jedną stronę rankingu sojuszy; surowe wiersze są zachowywane. */
export async function fetchAllianceRanking(start = "5", options = {}) {
  const payload = await request("hgh", { LT: 11, LID: 1, SV: String(start) }, options);
  const content = payload.content || {};
  let rows = content.L ?? content.alliances ?? content.items ?? [];
  if (!Array.isArray(rows) && rows && typeof rows === "object") rows = Object.values(rows);
  if (!Array.isArray(rows) || !rows.length) {
    throw new E4KApiError("hgh: brak rozpoznawalnych wierszy rankingu", {
      start, contentKeys: Object.keys(content)
    });
  }
  return {
    captured_at: new Date().toISOString(),
    server: options.server || DEFAULT_SERVER,
    command: "hgh",
    params: { LT: 11, LID: 1, SV: String(start) },
    count: rows.length,
    rows
  };
}

/** Pobiera stronę rankingu graczy PL1 (LT 1 = potęga, LT 2 = chwała). */
export async function fetchPlayerRankingPage({ listType = 1, page = 1, pageSize = 100 } = {}, options = {}) {
  if (![1, 2].includes(Number(listType))) throw new TypeError("listType musi wynosić 1 (potęga) lub 2 (chwała)");
  if (!Number.isInteger(Number(page)) || Number(page) < 1) throw new TypeError("page musi być dodatnią liczbą całkowitą");
  const params = { LT: Number(listType), LID: 1, SV: "1", page: Number(page), R: Number(pageSize) };
  const payload = await request("hgh", params, options);
  const root = payload.data ?? payload.content ?? payload;
  const data = root.data ?? root;
  let rows = data.highscoreList ?? data.HL ?? data.L ?? data.players ?? data.items ?? [];
  if (!Array.isArray(rows) && rows && typeof rows === "object") rows = Object.values(rows);
  if (!Array.isArray(rows)) throw new E4KApiError("hgh: odpowiedź rankingu graczy nie zawiera listy", {
    params, keys: Object.keys(data || {})
  });
  return {
    list_type: Number(listType), page: Number(page),
    total_count: Number(data.totalCount ?? data.total_count ?? 0) || null,
    rows, params
  };
}

/** Pobiera do 1000 graczy z rankingu potęgi i uzupełnia ich rankingiem chwały. */
export async function fetchServerPlayerRanking({ limit = 1000, pageSize = 100, maxPages = 10 } = {}, options = {}) {
  const byId = new Map();
  let totalCount = null, pagesFetched = 0;
  for (let page = 1; page <= maxPages && byId.size < limit; page++) {
    const result = await fetchPlayerRankingPage({ listType: 1, page, pageSize }, options);
    pagesFetched++;
    if (result.total_count !== null) totalCount = result.total_count;
    for (const row of result.rows) {
      const id = row.PID ?? row.playerId ?? row.player_id ?? row.id;
      if (id === undefined || id === null) continue;
      const key = String(id);
      const previous = byId.get(key) || {};
      byId.set(key, { ...previous, ...row, PID: id });
    }
    if (!result.rows.length || result.rows.length < pageSize || (totalCount !== null && byId.size >= totalCount)) break;
  }
  if (!byId.size) throw new E4KApiError("hgh LT=1: ranking nie zwrócił żadnych graczy", { pagesFetched });
  // LT=2 dostarcza osobny ranking chwały; brak odpowiedzi nie unieważnia poprawnego rankingu potęgi.
  try {
    for (let page = 1; page <= maxPages && byId.size; page++) {
      const result = await fetchPlayerRankingPage({ listType: 2, page, pageSize }, options);
      for (const row of result.rows) {
        const id = row.PID ?? row.playerId ?? row.player_id ?? row.id;
        if (id === undefined || id === null) continue;
        const current = byId.get(String(id));
        if (current) current.glory_points = row.LT_points ?? row.P ?? row.POW ?? null;
      }
      if (!result.rows.length || result.rows.length < pageSize) break;
    }
  } catch (error) {
    console.warn("hgh LT=2: ranking chwały niedostępny; zachowuję ranking potęgi:", error.message);
  }
  const players = [...byId.values()].slice(0, limit).map((row, index) => ({
    player_id: Number(row.PID),
    name: String(row.N ?? row.playerName ?? row.nick ?? ""),
    alliance_id: Number(row.AID ?? row.allianceId ?? 0),
    alliance_name: String(row.AN ?? row.allianceName ?? (Number(row.AID ?? 0) === 0 ? "Brak sojuszu" : "")),
    rank: Number(row.rank ?? index + 1),
    power: (row.P ?? row.POW ?? row.power) !== null && (row.P ?? row.POW ?? row.power) !== undefined && Number.isFinite(Number(row.P ?? row.POW ?? row.power)) ? Number(row.P ?? row.POW ?? row.power) : null,
    glory_points: row.glory_points !== null && row.glory_points !== undefined && Number.isFinite(Number(row.glory_points)) ? Number(row.glory_points) : null,
    loot: (row.loot ?? row.LOOT ?? row.loot_points) !== null && (row.loot ?? row.LOOT ?? row.loot_points) !== undefined && Number.isFinite(Number(row.loot ?? row.LOOT ?? row.loot_points)) ? Number(row.loot ?? row.LOOT ?? row.loot_points) : null,
    level: Number.isFinite(Number(row.L)) ? Number(row.L) : null,
    legend_level: Number.isFinite(Number(row.LL)) ? Number(row.LL) : null,
    raw: row
  })).filter(p => Number.isFinite(p.player_id) && p.player_id > 0 && p.name);
  if (!players.length) throw new E4KApiError("hgh: rekordy nie zawierają poprawnego PID i nicku");
  return {
    schema_version: 1, server: options.server || DEFAULT_SERVER,
    captured_at: new Date().toISOString(), source: "hgh",
    query: { LT: 1, LID: 1, SV: "1", page_size: pageSize, limit },
    total_count: totalCount, pages_fetched: pagesFetched,
    player_count: players.length, players
  };
}

/** Lekki test łączności dwóch potwierdzonych komend. Nie ukrywa błędów. */
export async function testReadOnlyApi(options = {}) {
  const checks = [];
  for (const [name, run] of [
    ["ain AID 115", () => fetchAlliance(115, options)],
    ["hgh ranking SV=5", () => fetchAllianceRanking("5", options)]
  ]) {
    try {
      const result = await run();
      checks.push({ name, ok: true, counts: result.counts || { rows: result.count } });
    } catch (error) {
      checks.push({ name, ok: false, error: error.message, details: error.details || null });
    }
  }
  return { tested_at: new Date().toISOString(), server: options.server || DEFAULT_SERVER, checks };
}
