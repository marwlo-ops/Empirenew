import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../.github/workflows/", import.meta.url);
const canonical = await readFile(new URL("import-it1-fortresses.yml", root), "utf8");
const legacy = await readFile(new URL("baron-map-import.yml", root), "utf8");

assert.match(canonical, /schedule:\s*\n\s*- cron:/, "The canonical Python importer must own the refresh schedule");
assert.match(canonical, /push:\s*\n[\s\S]*paths:\s*\n[\s\S]*scripts\/import_it1_fortresses\.py/, "Importer changes must trigger the canonical workflow");
assert.match(canonical, /push:\s*\n[\s\S]*paths:\s*\n[\s\S]*tests\/test_import_it1_fortresses\.py/, "Importer test changes must trigger the canonical workflow");
assert.match(canonical, /python scripts\/import_it1_fortresses\.py/, "The canonical workflow must run the validated Python importer");
assert.match(canonical, /contents:\s*write/, "Only the canonical importer may publish the map catalog");
assert.match(canonical, /uses: actions\/checkout@v4\s*\n\s*with:\s*\n\s*# Queued runs must start from the latest main, not the stale push-event SHA\.\s*\n\s*ref: main/, "Queued imports must check out the current main branch");
assert.match(canonical, /concurrency:\s*\n\s*group: empire-new-it1-map\s*\n\s*cancel-in-progress: false/, "Map imports must remain serialized without cancelling the active publisher");
assert.match(canonical, /git push/, "The canonical workflow must publish validated catalog changes");

assert.doesNotMatch(legacy, /schedule:/, "The legacy workflow must not schedule a second importer");
assert.doesNotMatch(legacy, /contents:\s*write/, "The legacy workflow must not have write permission");
assert.doesNotMatch(legacy, /scripts\/import-baron-map\.js/, "The legacy workflow must not run the retired JavaScript importer");
assert.doesNotMatch(legacy, /git push/, "The validation-only workflow must not publish data");
assert.match(legacy, /node scripts\/test-barony-mobile\.mjs/, "The legacy workflow must retain mobile UI validation");
assert.match(legacy, /node scripts\/test-baron-map-catalog\.mjs/, "The legacy workflow must retain catalog validation");

console.log("Barony import workflow ownership: PASS (one scheduled publisher; legacy workflow is read-only validation)");
