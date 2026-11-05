import fs from "node:fs/promises";

const API = "https://api.gge-tracker.com/api/v1/dungeons";
const SERVER = "IT1";
const OUTPUT = new URL("../data/baron-fortresses.json", import.meta.url);
const KINGDOMS = {
  1: { key: "sands", name: "Płonące Piaski" },
  2: { key: "ice", name: "Wieczny Lód" },
  3: { key: "fire", name: "Ogniste Szczyty" }
};
const PAGE_SIZE = 4000;

async function fetchPage(page) {
  const url = new URL(API);
  url.search = new URLSearchParams({
    page: String(page),
    size: String(PAGE_SIZE),
    filterByKid: JSON.stringify([1, 2, 3])
  }).toString();

  const response = await fetch(url, {
    headers: { "gge-server": SERVER, Accept: "application/json" },
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error("GGE Tracker HTTP " + response.status + " on page " + page);

  const payload = await response.json();
  if (!Array.isArray(payload.dungeons) || !payload.pagination) {
    throw new Error("Unexpected GGE Tracker response schema on page " + page);
  }
  return payload;
}

const records = new Map();
let page = 1;
let totalPages = 1;
let expectedTotal = null;

do {
  const payload = await fetchPage(page);
  const pagination = payload.pagination;
  const pages = Number(pagination.total_pages);
  const total = Number(pagination.total_items_count);

  if (!Number.isInteger(pages) || pages < 1 || !Number.isInteger(total) || total < 0) {
    throw new Error("Invalid pagination metadata on page " + page);
  }
  if (expectedTotal === null) {
    expectedTotal = total;
    totalPages = pages;
  } else if (expectedTotal !== total || totalPages !== pages) {
    throw new Error("Pagination changed while reading IT1; refusing partial import");
  }

  for (const item of payload.dungeons) {
    const kid = Number(item.kid);
    const kingdom = KINGDOMS[kid];
    const x = Number(item.position_x);
    const y = Number(item.position_y);
    if (!kingdom || !Number.isInteger(x) || !Number.isInteger(y) ||
        x < 0 || y < 0 || x > 1286 || y > 1286) {
      throw new Error("Invalid map-only dungeon record on page " + page);
    }
    const id = "it1-" + kid + "-" + x + "-" + y;
    records.set(id, {
      id, kid, kingdom: kingdom.key, x, y,
      type: "dungeon",
      source_server: SERVER
    });
  }
  console.log("IT1 page " + page + "/" + totalPages + ": " + payload.dungeons.length + " records");
  page += 1;
} while (page <= totalPages);

if (records.size === 0 || records.size !== expectedTotal) {
  throw new Error("Incomplete IT1 import: unique=" + records.size + ", expected=" + expectedTotal);
}

const results = {
  sands: { fortress_count: 0, complete: true, fortresses: [] },
  ice: { fortress_count: 0, complete: true, fortresses: [] },
  fire: { fortress_count: 0, complete: true, fortresses: [] }
};
for (const fortress of records.values()) results[fortress.kingdom].fortresses.push(fortress);
for (const group of Object.values(results)) {
  group.fortresses.sort((a, b) => a.x - b.x || a.y - b.y);
  group.fortress_count = group.fortresses.length;
}

const output = {
  schema_version: 2,
  captured_at: new Date().toISOString(),
  source: "GGE Tracker public API · map coordinates only",
  server_source: SERVER,
  complete: true,
  total_count: records.size,
  results,
  note: "Imported from GGE Tracker IT1. This file intentionally contains only kingdom and map coordinates; attack activity and cooldown are queried separately from the E4K target server."
};
await fs.writeFile(OUTPUT, JSON.stringify(output, null, 2) + "\n", "utf8");
console.log("Saved " + records.size + " unique IT1 map locations to data/baron-fortresses.json.");
