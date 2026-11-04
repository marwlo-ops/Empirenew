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
  if (String(payload.return_code) !== "0") {
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
