import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../barony.html", import.meta.url), "utf8");
assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">/);
assert.match(html, /@media\(max-width:760px\)/);
assert.match(html, /\.controls button,\.controls select,\.controls input,\.item button\{min-height:44px\}/);
assert.match(html, /:focus-visible/);
assert.match(html, /Zapisane lokalnie/);
assert.match(html, /Z wpisem lokalnym/);
assert.match(html, /Wpis ręczny/);
assert.match(html, /Obserwowane lokalnie/);
assert.match(html, /Źródło nieoznaczone/);
assert.doesNotMatch(html, /Obserwowane w PL1/);
assert.match(html, /id="intelSignals"/);
assert.match(html, /Nie zawiera współrzędnych celu/);
assert.doesNotMatch(html, /Sprawdzone w PL1/);

console.log("Barony mobile viewport, 44px touch targets, focus states and local-history labels: PASS");
