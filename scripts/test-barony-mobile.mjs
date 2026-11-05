import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

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
assert.match(html, /sourceLabel\+' · minęło odnowienie/);
assert.doesNotMatch(html, /Obserwowane w PL1/);
assert.match(html, /id="intelSignals"/);
assert.match(html, /Nie zawiera współrzędnych celu/);
assert.doesNotMatch(html, /Sprawdzone w PL1/);
assert.match(html, /Brak potwierdzonego celu ataku w tych sygnałach/);
assert.match(html, /nie jest dowodem ataku na fortecę/i);
assert.doesNotMatch(html, /kandydaci w pobliżu fortec IT1/i);
assert.doesNotMatch(html, /Kandydat w pobliżu/);

const scriptStart = html.lastIndexOf("<script>");
const scriptEnd = html.indexOf("</script>", scriptStart);
assert.ok(scriptStart >= 0 && scriptEnd > scriptStart, "Barony must have an inline script");
const inlineScript = html.slice(scriptStart + "<script>".length, scriptEnd);
const scriptPath = "/tmp/empirenew-barony-inline.js";
await writeFile(scriptPath, inlineScript, "utf8");
const syntax = spawnSync(process.execPath, ["--check", scriptPath], { encoding: "utf8" });
assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout || "Barony inline JavaScript syntax check failed");

console.log("Barony mobile viewport, touch targets, local-history labels, evidence separation and inline JS syntax: PASS");

console.log("Barony mobile viewport, 44px touch targets, focus states and local-history labels: PASS");
