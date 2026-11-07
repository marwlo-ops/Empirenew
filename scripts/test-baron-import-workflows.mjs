import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../.github/workflows/", import.meta.url);
const legacy = await readFile(new URL("baron-map-import.yml", root), "utf8");

assert.doesNotMatch(legacy, /schedule:/, "The legacy workflow must not schedule a second importer");
assert.doesNotMatch(legacy, /contents:\s*write/, "The legacy workflow must not have write permission");
assert.doesNotMatch(legacy, /scripts\/import-baron-map\.js/, "The legacy workflow must not run the retired JavaScript importer");
assert.doesNotMatch(legacy, /git push/, "The validation-only workflow must not publish data");
assert.match(legacy, /node scripts\/test-barony-mobile\.mjs/, "The legacy workflow must retain mobile UI validation");
assert.match(legacy, /node scripts\/test-baron-map-catalog\.mjs/, "The legacy workflow must retain catalog validation");

console.log("Barony map workflow policy: PASS (IT1 scheduled importer removed; legacy workflow is read-only validation)");
