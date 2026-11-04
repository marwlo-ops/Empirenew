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
  // empire-api/app.js parses headers as JSON.parse(`{${req.params.headers}}`).
  // Therefore the path segment must contain JSON object members WITHOUT outer braces.
  // Sending encodeURIComponent(JSON.stringify(params)) adds a second pair of braces
  // after Express decodes the route parameter and is rejected as "Invalid command or headers".
  const encoded = command === "ain"
    ? `%22AID%22:${encodeURIComponent(String(params.AID))}`
    : encodeURIComponent(JSON.stringify(params).slice(1, -1));
  const url = `${base}/${encodeURIComponent(server)}/${command}/${encoded}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: options.signal
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new E4KApiError(`${command}: HTTP ${response.status}`, {
      url, status: response.status, response_body: body.slice(0, 2000), params
    });
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

/** Pobiera pojedynczy ranking graczy. Paginacja hgh nie jest jeszcze potwierdzona. */
export async function fetchPlayerRankingPage({ listType = 1 } = {}, options = {}) {
  if (![1, 2].includes(Number(listType))) throw new TypeError("listType musi wynosić 1 (potęga) lub 2 (chwała)");
  // Minimalny wariant zgodny ze znanym, działającym wzorcem hgh dla sojuszy.
  // SV=5 jest hipotezą do weryfikacji, a nie potwierdzonym typem rankingu graczy.
  const params = { LT: Number(listType), LID: 1, SV: "5" };
  const payload = await request("hgh", params, options);
  const root = payload.data ?? payload.content ?? payload;
  const data = root.data ?? root;
  let rows = data.highscoreList ?? data.HL ?? data.L ?? data.players ?? data.items ?? data;
  if (!Array.isArray(rows) && rows && typeof rows === "object") {
    const candidate = Object.values(rows).find(value => Array.isArray(value));
    rows = candidate || [];
  }
  if (!Array.isArray(rows) || !rows.length) throw new E4KApiError("hgh: odpowiedź 200, ale nie rozpoznano listy graczy", {
    params, rootKeys: Object.keys(root || {}), dataKeys: Object.keys(data || {}),
    responsePreview: JSON.stringify(payload).slice(0, 3000)
  });
  return { list_type: Number(listType), rows, params, response_keys: Object.keys(data || {}) };
}

/** Pobiera ranking graczy. hgh zwraca rekordy jako krotki [typ, wynik, profil]. */
export async function fetchServerPlayerRanking({ limit = 1000 } = {}, options = {}) {
  const result = await fetchPlayerRankingPage({ listType: 1 }, options);
  const records = result.rows.map((entry, index) => {
    if (Array.isArray(entry)) {
      const profile = [...entry].reverse().find(value => value && typeof value === "object" && !Array.isArray(value));
      return profile ? { ...profile, _ranking_position: index + 1, _ranking_tuple: entry.slice(0, -1) } : null;
    }
    return entry && typeof entry === "object" ? { ...entry, _ranking_position: index + 1 } : null;
  }).filter(Boolean);
  const byId = new Map();
  for (const row of records) {
    const id = row.PID ?? row.OID ?? row.playerId ?? row.player_id ?? row.id;
    if (id === undefined || id === null) continue;
    byId.set(String(id), { ...row, PID: id });
  }
  const players = [...byId.values()].slice(0, limit).map((row, index) => {
    const aid = Number(row.AID ?? row.allianceId ?? 0);
    const powerValue = row.MP ?? row.P ?? row.POW ?? row.power;
    return {
      player_id: Number(row.PID),
      name: String(row.N ?? row.PN ?? row.playerName ?? row.nick ?? ""),
      alliance_id: Number.isFinite(aid) && aid > 0 ? aid : 0,
      alliance_name: String(row.AN ?? row.allianceName ?? (aid > 0 ? `Sojusz #${aid}` : "Brak sojuszu")),
      rank: Number(row.rank ?? row.RANK ?? row._ranking_position ?? index + 1),
      power: powerValue != null && Number.isFinite(Number(powerValue)) ? Number(powerValue) : null,
      glory_points: (row.glory_points ?? row.GP) != null && Number.isFinite(Number(row.glory_points ?? row.GP)) ? Number(row.glory_points ?? row.GP) : null,
      loot: (row.loot ?? row.LOOT ?? row.loot_points) != null && Number.isFinite(Number(row.loot ?? row.LOOT ?? row.loot_points)) ? Number(row.loot ?? row.LOOT ?? row.loot_points) : null,
      level: row.L != null && Number.isFinite(Number(row.L)) ? Number(row.L) : null,
      legend_level: row.LL != null && Number.isFinite(Number(row.LL)) ? Number(row.LL) : null,
      raw: row
    };
  }).filter(p => Number.isFinite(p.player_id) && p.player_id > 0 && p.name);
  if (!players.length) throw new E4KApiError("hgh: odpowiedź zawiera wiersze, ale nie rozpoznano PID/OID i nicku", {
    params: result.params, rowCount: result.rows.length, rowKeys: Object.keys(records[0] || {}),
    firstRowPreview: JSON.stringify(result.rows[0] || {}).slice(0, 2500)
  });
  return { schema_version: 1, server: options.server || DEFAULT_SERVER, captured_at: new Date().toISOString(),
    source: "hgh", query: result.params, pages_fetched: 1, player_count: players.length,
    total_count: players.length, players, raw_row_count: result.rows.length, response_keys: result.response_keys };
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
