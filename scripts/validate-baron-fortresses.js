import fs from "node:fs/promises";

const file = new URL("../data/baron-fortresses.json", import.meta.url);
const data = JSON.parse(await fs.readFile(file, "utf8"));
const expected = { sands: 1, ice: 2, fire: 3 };
const forbidden = new Set([
  "attacked_at", "last_attack", "last_attacker_id", "player_id", "player_name",
  "attack_count", "total_attack_count", "cooldown", "cooldown_until",
  "available_at", "global_available_at", "effective_cooldown_until",
  "available_duration_seconds", "player_available_at"
]);
const fail = message => { console.error("BARONY CATALOG FAIL:", message); process.exit(1); };

if (data.complete !== true) fail("Katalog nie ma complete=true.");
if (!Number.isFinite(Date.parse(data.captured_at))) fail("Brak poprawnego captured_at.");
if (data.server_source !== "IT1") fail("server_source musi być IT1.");
if (!data.results || Object.keys(data.results).sort().join(",") !== "fire,ice,sands") fail("Oczekiwane są dokładnie krainy sands, ice, fire.");

let total = 0;
const allIds = new Set();
for (const [kingdom, kid] of Object.entries(expected)) {
  const group = data.results[kingdom];
  if (group.complete !== true || !Array.isArray(group.fortresses)) fail(kingdom + ": brak kompletnej listy fortec.");
  if (Number(group.fortress_count) !== group.fortresses.length) fail(kingdom + ": niezgodna fortress_count.");
  const coords = new Set();
  for (const row of group.fortresses) {
    if (row.kingdom !== kingdom || Number(row.kid) !== kid) fail(kingdom + ": niezgodny kingdom/kid.");
    if (!Number.isInteger(row.x) || !Number.isInteger(row.y) || row.x < 0 || row.y < 0 || row.x > 1286 || row.y > 1286) {
      fail(kingdom + ": współrzędne poza zakresem 0..1286.");
    }
    if (row.type !== "dungeon" || row.source_server !== "IT1") fail(kingdom + ": niezgodny typ lub źródło.");
    if (typeof row.id !== "string" || !row.id) fail(kingdom + ": brak identyfikatora.");
    const coordinateKey = [row.kid, row.x, row.y].join(":");
    if (coords.has(coordinateKey)) fail(kingdom + ": duplikat współrzędnych " + coordinateKey);
    coords.add(coordinateKey);
    if (allIds.has(row.id)) fail("Powtórzony identyfikator: " + row.id);
    allIds.add(row.id);
    for (const key of Object.keys(row)) if (forbidden.has(key)) fail("Pole ataku/cooldown nie może być w katalogu mapy: " + key);
  }
  total += group.fortresses.length;
}
if (total !== Number(data.total_count)) fail("total_count nie zgadza się z liczbą rekordów.");
console.log(JSON.stringify({
  ok: true, source: data.source, server_source: data.server_source,
  captured_at: data.captured_at, total_count: total,
  by_kingdom: Object.fromEntries(Object.entries(data.results).map(([key, value]) => [key, value.fortress_count])),
  duplicate_coordinates: 0, attack_or_cooldown_fields: 0
}, null, 2));
