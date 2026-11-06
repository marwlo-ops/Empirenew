import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalog = JSON.parse(
  await readFile(new URL("../data/baron-fortresses.json", import.meta.url), "utf8")
);
const expected = { sands: 1, ice: 2, fire: 3 };
const seen = new Set();
const seenIds = new Set();
const allowedPointKeys = ["id", "kid", "kingdom", "x", "y", "type", "source_server"].sort();
let total = 0;

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
