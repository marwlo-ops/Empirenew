import fs from "node:fs/promises";

const html = await fs.readFile(new URL("../barony.html", import.meta.url), "utf8");
const fail = message => { console.error("BARONY UI CHECK FAIL:", message); process.exit(1); };
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
if (!scripts.length) fail("Brak skryptu aplikacji.");
for (let i = 0; i < scripts.length; i++) {
  try { new Function(scripts[i][1]); }
  catch (error) { fail("Błąd składni skryptu " + (i + 1) + ": " + error.message); }
}
if (!html.includes('name="viewport"') || !html.includes("width=device-width")) fail("Brak viewportu mobile.");
if (!/@media\s*\(max-width:\s*760px\)/i.test(html)) fail("Brak reguł mobilnych.");
if (!/min-height:\s*44px/.test(html)) fail("Kontrolki nie mają minimalnego celu dotykowego 44 px.");
for (const kingdom of ["sands", "ice", "fire"]) {
  if (!html.includes('data-k="' + kingdom + '"')) fail("Brak selektora krainy " + kingdom + ".");
}
if (/data-k=["'](?:islands|unassigned)["']/.test(html)) fail("Widok zawiera nieobsługiwane krainy.");
if (!/nie jest dowodem ataku/i.test(html)) fail("Brak ostrzeżenia o braku dowodu ataku.");
if (!/localStorage/.test(html)) fail("Brak jawnego lokalnego rejestru.");
if (!html.includes("Data i godzina faktycznego ataku") || !html.includes("window.confirm")) {
  fail("Ręczny wpis musi wymagać rzeczywistej daty/godziny i potwierdzenia.");
}
if (html.includes("'Mój atak'")) fail("Nie wolno podpowiadać fikcyjnego atakującego.");
if (html.includes("loadPlayerNames") || html.includes("saveObservation")) fail("Wykryto nieużywaną logikę.");
console.log(JSON.stringify({
  ok: true,
  inline_scripts_compiled: scripts.length,
  mobile_viewport: true,
  responsive_breakpoint: "760px",
  minimum_touch_target_px: 44,
  manual_attack_requires_date_and_confirmation: true,
  kingdoms: ["sands", "ice", "fire"]
}, null, 2));
