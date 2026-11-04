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

/**
 * hgh returns six adjacent ranking entries. SV is the frame rank:
 * returned rank positions are [SV-2 .. SV+3], clipped by the leaderboard bounds.
 * Use SV=3,9,15... to harvest blocks [1..6], [7..12], [13..18]...
 * Every page is checked against explicit rank numbers and a stable LR.
 */
async function fetchHighscoreBlock(listType, frameRank, options = {}) {
  const params = { LT: Number(listType), LID: 1, SV: String(frameRank) };
  const payload = await request("hgh", params, options);
  const content = payload.content ?? payload.data ?? {};
  const rows = content.L ?? content.highscoreList ?? content.HL ?? content.players ?? content.items;
  const total = Number(content.LR ?? payload.LR);
  const fr = Number(content.FR ?? payload.FR);
  if (!Array.isArray(rows) || !rows.length || !Number.isInteger(total) || total < 1 || !Number.isInteger(fr)) {
    throw new E4KApiError("hgh: brak poprawnej listy lub metadanych FR/LR", {
      params, keys: Object.keys(content), FR: content.FR, LR: content.LR,
      preview: JSON.stringify(payload).slice(0, 1800)
    });
  }
  return { rows, total, frame_rank: fr, requested_frame_rank: Number(frameRank), params };
}

function extractRankedProfile(entry) {
  if (!Array.isArray(entry) || entry.length < 3) return null;
  const rank = Number(entry[0]);
  const profile = entry.findLast(value => value && typeof value === "object" && !Array.isArray(value));
  if (!Number.isInteger(rank) || rank < 1 || !profile) return null;
  const id = profile.OID ?? profile.PID ?? profile.ID;
  const name = profile.N ?? profile.PN ?? profile.NAME;
  if (id == null || name == null) return null;
  return { rank, profile, id: String(id), name: String(name) };
}

async function fetchCompleteHighscore(listType, options = {}) {
  const first = await fetchHighscoreBlock(listType, 3, options);
  const total = first.total;
  const byRank = new Map();
  const byId = new Map();
  let pagesFetched = 0;
  for (let expectedStart = 1; expectedStart <= total; expectedStart += 6) {
    const frameRank = expectedStart + 2;
    const page = expectedStart === 1 ? first : await fetchHighscoreBlock(listType, frameRank, options);
    pagesFetched += 1;
    if (page.total !== total) {
      throw new E4KApiError("hgh: LR zmieniło się w trakcie pobierania rankingu", {
        listType, expectedTotal: total, actualTotal: page.total, expectedStart, frameRank
      });
    }
    const expectedEnd = Math.min(expectedStart + 5, total);
    const pageEntries = page.rows.map(extractRankedProfile).filter(Boolean);
    const pageRanks = pageEntries.map(item => item.rank).sort((a,b)=>a-b);
    const expectedRanks = Array.from({length: expectedEnd - expectedStart + 1}, (_,i)=>expectedStart+i);
    if (JSON.stringify(pageRanks) !== JSON.stringify(expectedRanks)) {
      throw new E4KApiError("hgh: luka lub nadmiar pozycji w bloku rankingu", {
        listType, expectedStart, expectedEnd, frameRank, returnedRanks: pageRanks,
        expectedRanks, FR: page.frame_rank, LR: page.total
      });
    }
    for (const item of pageEntries) {
      if (byRank.has(item.rank)) throw new E4KApiError("hgh: powtórzona pozycja rankingu", { rank:item.rank, listType });
      if (byId.has(item.id)) throw new E4KApiError("hgh: ten sam OID występuje pod różnymi pozycjami", {
        id:item.id, previousRank:byId.get(item.id), rank:item.rank, listType
      });
      byRank.set(item.rank, item.profile);
      byId.set(item.id, item.rank);
    }
    if (expectedStart + 6 <= total) await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (byRank.size !== total) throw new E4KApiError("hgh: liczba unikalnych profili nie zgadza się z LR", {
    listType, expected:total, actual:byRank.size, pagesFetched
  });
  return { rows:[...byRank.entries()].sort((a,b)=>a[0]-b[0]).map(([rank,profile])=>({rank,profile})),
    total, pagesFetched, list_type:Number(listType) };
}

/** Pobiera ranking graczy w całości; nie zapisuje danych. */
export async function fetchPlayerRankingPage({ listType = 1 } = {}, options = {}) {
  if (![1, 2].includes(Number(listType))) throw new TypeError("listType musi wynosić 1 (potęga) lub 2 (chwała)");
  const result = await fetchCompleteHighscore(Number(listType), options);
  return { list_type:result.list_type, rows:result.rows.map(({rank,profile})=>[rank,null,profile]),
    total_count:result.total, pages_fetched:result.pagesFetched, command:"hgh" };
}

/** Pobiera i waliduje kompletny ranking graczy. */
export async function fetchServerPlayerRanking({ limit = 1000 } = {}, options = {}) {
  const result = await fetchCompleteHighscore(1, options);
  const players = result.rows.map(({rank,profile:row}) => {
    const aid = Number(row.AID ?? row.allianceId ?? 0);
    const powerValue = row.MP ?? row.P ?? row.POW ?? row.power;
    return {
      player_id:Number(row.OID ?? row.PID ?? row.ID),
      name:String(row.N ?? row.PN ?? row.NAME ?? ""),
      alliance_id:Number.isFinite(aid) && aid > 0 ? aid : 0,
      alliance_name:String(row.AN ?? row.allianceName ?? (aid > 0 ? `Sojusz #${aid}` : "Brak sojuszu")),
      rank,
      power:powerValue != null && Number.isFinite(Number(powerValue)) ? Number(powerValue) : null,
      glory_points:(row.AVP ?? row.GP) != null && Number.isFinite(Number(row.AVP ?? row.GP)) ? Number(row.AVP ?? row.GP) : null,
      loot:(row.loot ?? row.LOOT ?? row.loot_points) != null && Number.isFinite(Number(row.loot ?? row.LOOT ?? row.loot_points)) ? Number(row.loot ?? row.LOOT ?? row.loot_points) : null,
      level:row.L != null && Number.isFinite(Number(row.L)) ? Number(row.L) : null,
      legend_level:row.LL != null && Number.isFinite(Number(row.LL)) ? Number(row.LL) : null,
      raw:row
    };
  }).filter(p=>Number.isFinite(p.player_id) && p.player_id > 0 && p.name);
  if (players.length !== result.total) throw new E4KApiError("hgh: nie wszystkie pozycje zawierają rozpoznawalny profil", {
    expected:result.total, normalized:players.length, pagesFetched:result.pagesFetched
  });
  return { schema_version:1, server:options.server || DEFAULT_SERVER, captured_at:new Date().toISOString(),
    source:"hgh", query:{LT:1,LID:1}, pages_fetched:result.pagesFetched,
    player_count:players.length, total_count:result.total, leaderboard_total:result.total,
    complete:true, ranking_validated:true, players };
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

/**
 * Read-only matrix diagnostic for PL1 highscore commands.
 * Does not write snapshots. Keep the production tracker fail-safe.
 */
export async function probePlayerRankingRanges(options = {}) {
  const probes = [];
  // Focus on player and alliance rankings. SV values deliberately include
  // adjacent steps and large jumps; do not assume SV is a page number.
  for (const lt of [1, 11]) {
    for (const sv of ["1", "2", "3", "4", "5", "6", "7", "8", "10", "13", "20", "50", "100", "200", "284"]) {
      probes.push({ name: `hgh-LT${lt}-SV${sv}`, command: "hgh", params: { LT: lt, LID: 1, SV: sv } });
    }
  }
  for (const range of [[0, 99], [1, 100], [0, 100], "0-99", "1-100"]) {
    probes.push({ name: `llsp-R-${JSON.stringify(range)}`, command: "llsp", params: { LT: 1, LID: 1, R: range } });
  }
  const results = [];
  for (const probe of probes) {
    try {
      const payload = await request(probe.command, probe.params, options);
      const content = payload.content ?? payload.data ?? {};
      const arrays = [];
      const visit = (value, path = "content", depth = 0) => {
        if (depth > 5 || value == null) return;
        if (Array.isArray(value)) { arrays.push({ path, count: value.length, first: value[0] ?? null }); return; }
        if (typeof value === "object") for (const [key, child] of Object.entries(value)) visit(child, path + "." + key, depth + 1);
      };
      visit(content);
      const firstArray = arrays.find(item => item.first != null);
      const firstTuple = firstArray?.first;
      const lastTuple = firstArray && Array.isArray(firstArray.first) ? null : null;
      const metadata = {
        FR: content.FR ?? payload.FR ?? null,
        LR: content.LR ?? payload.LR ?? null,
        SV: content.SV ?? payload.SV ?? null
      };
      const tuplePosition = tuple => Array.isArray(tuple) && tuple.length
        ? Number(tuple[0]) : null;
      results.push({ name: probe.name, ok: true, return_code: payload.return_code,
        metadata, arrays,
        first_record_position: tuplePosition(firstTuple),
        preview: JSON.stringify(content).slice(0, 900) });
    } catch (error) {
      results.push({ name: probe.name, ok: false, error: error.message, details: error.details || null });
    }
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  console.log("PL1 RANKING MATRIX:", JSON.stringify({ server: options.server || DEFAULT_SERVER,
    summary: results.map(r => ({ name: r.name, ok: r.ok, arrays: r.arrays?.map(a => ({path:a.path,count:a.count})), error:r.error })),
    results }));
  return results;
}
