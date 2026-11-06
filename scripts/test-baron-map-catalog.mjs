import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalog = JSON.parse(
  await readFile(new URL("../data/baron-fortresses.json", import.meta.url), "utf8")
);
const expected = { sands: 1, ice: 2, fire: 3 };
const seen = new Set();
const seenIds = new Set();
const allowedPointKeys = ["id", "kid", "kingdom", "x", "y", "type", "source_server"].sort();
const allowedCatalogKeys = [
  "schema_version", "captured_at", "source", "server_source", "target_server",
  "coordinate_alignment", "complete", "pages_read", "total_count", "results", "note"
].sort();
const forbiddenDynamicKey = /cooldown|attack|attacked_at|last_attack|player_id|player_name|defeater|ready|readiness|available|gotow/i;

function findForbiddenKey(value, path = "catalog") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenKey(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenDynamicKey.test(key)) return `${path}.${key}`;
    const found = findForbiddenKey(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}
let total = 0;

assert.deepEqual(Object.keys(catalog).sort(), allowedCatalogKeys,
  "Public catalog must use the reviewed top-level map-only schema");
assert.equal(catalog.schema_version, 2, "Catalog schema version must be 2");
assert.equal(catalog.target_server, "E4K_PL1", "Catalog target must remain production PL1");
assert.ok(Number.isInteger(catalog.pages_read) && catalog.pages_read > 0,
  "Catalog must record a positive number of pages read");
assert.match(catalog.coordinate_alignment || "", /^operator_confirmed;/,
  "IT1-to-PL1 coordinate alignment must remain explicitly operator-confirmed");
assert.equal(findForbiddenKey(catalog), null,
  "No attack, player, cooldown, readiness or availability fields may appear at any catalog depth");
const nestedPollution = structuredClone(catalog);
nestedPollution.diagnostic = { nested: { cooldown_seconds: 3600 } };
assert.match(findForbiddenKey(nestedPollution) || "", /diagnostic\.nested\.cooldown_seconds/,
  "Recursive guard must detect forbidden metadata outside fortress rows");
assert.equal(catalog.complete, true, "IT1 catalog must be complete");
assert.equal(catalog.server_source, "IT1", "Catalog source must remain IT1");
assert.match(catalog.source || "", /GGE Tracker/i, "Catalog must name GGE Tracker as its source");
assert.match(catalog.source || "", /map coordinates only/i, "Catalog must be map-only");
assert.ok(Number.isFinite(Date.parse(catalog.captured_at)), "Catalog capture time must be valid ISO date text");
assert.ok(catalog.results && typeof catalog.results === "object", "Catalog results must be an object");
assert.deepEqual(Object.keys(catalog.results).sort(), Object.keys(expected).sort(),
  "Catalog must contain exactly the sands, ice and fire groups");

for (const [kingdom, kid] of Object.entries(expected)) {
  const group = catalog.results[kingdom];
  assert.ok(group && group.complete === true, `${kingdom} group must be complete`);
  assert.ok(Array.isArray(group.fortresses), `${kingdom} fortresses must be an array`);
  assert.equal(group.fortress_count, group.fortresses.length, `${kingdom} count must match its rows`);
  assert.ok(group.fortresses.length > 0, `${kingdom} must contain map points`);

  for (const point of group.fortresses) {
    assert.deepEqual(Object.keys(point).sort(), allowedPointKeys,
      "Each public fortress record must contain only the seven approved map-only fields");
    assert.equal(typeof point.id, "string", "Each fortress must have a stable string ID");
    assert.ok(point.id.trim().length > 0, "Fortress ID must not be empty");
    assert.ok(!seenIds.has(point.id), `Duplicate fortress ID ${point.id}`);
    seenIds.add(point.id);
    assert.equal(point.kid, kid, `${kingdom} point must have KID ${kid}`);
    assert.equal(point.kingdom, kingdom, `${kingdom} point must stay in its kingdom group`);
    assert.equal(point.source_server, "IT1", "Each coordinate must retain its IT1 provenance");
    assert.equal(point.type, "dungeon", "Only dungeon/fortress map coordinates are published");
    assert.ok(Number.isInteger(point.x) && Number.isInteger(point.y), "Coordinates must be integers");
    assert.ok(point.x >= 0 && point.y >= 0 && point.x <= 1286 && point.y <= 1286,
      "Coordinates must stay within the validated map bounds");
    for (const key of Object.keys(point)) {
      assert.doesNotMatch(key, /cooldown|attack|attacked_at|last_attack|player_id|defeater|ready|gotow/i,
        `Forbidden attack/readiness field ${key} found in the public map catalog`);
    }
    const key = `${kid}:${point.x}:${point.y}`;
    assert.ok(!seen.has(key), `Duplicate IT1 coordinate ${key}`);
    seen.add(key);
  }
  total += group.fortresses.length;
}

assert.equal(catalog.total_count, total, "Top-level total_count must equal all kingdom groups");
assert.ok(total > 0, "Catalog must contain at least one map point");
console.log(`IT1 map-only catalog: PASS (${total} unique coordinates; no attack, cooldown, player or readiness fields)`);
