import fs from "node:fs/promises";
import { fetchAlliance, DEFAULT_SERVER } from "../api/e4k-client.js";

const ROOT = new URL("../", import.meta.url);
const paths = {
  snapshots: new URL("../data/location-snapshots.json", import.meta.url),
  castles: new URL("../data/location-history.json", import.meta.url),
  outposts: new URL("../data/outpost-history.json", import.meta.url)
};
const ALLIANCES = [{ aid: 115, minMembers: 20 }, { aid: 41343, minMembers: 15 }];
const now = new Date().toISOString();
const read = async (url, fallback) => { try { return JSON.parse(await fs.readFile(url, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; } };
const write = async (url, value) => fs.writeFile(url, JSON.stringify(value) + "\n");
const fail = message => { console.error("TRACKER FAIL-SAFE:", message); process.exit(1); };

function flatten(payloads) {
  const result = [];
  for (const d of payloads) {
    const aid = Number(d.alliance?.aid ?? d.aid);
    const allianceName = d.alliance?.name ?? d.name ?? `AID_${aid}`;
    if (!Array.isArray(d.members) || d.members.length === 0) fail(`AID ${aid}: pusta lista członków`);
    for (const m of d.members) {
      if (!Number.isInteger(Number(m.member_id)) || !m.name) fail(`AID ${aid}: niepoprawny gracz`);
      for (const p of (m.ap || [])) {
        if (![p.kingdom_code,p.object_id,p.x,p.y,p.type_code].every(v => Number.isFinite(Number(v)))) fail(`Niepoprawna pozycja AP gracza ${m.name}`);
        const type = Number(p.type_code);
        if (type === 1 || type === 12 || type === 4) result.push({
          member_id:Number(m.member_id), player:m.name, alliance_id:aid,
          alliance_name:allianceName, kingdom_code:Number(p.kingdom_code),
          object_id:Number(p.object_id), x:Number(p.x), y:Number(p.y), type_code:type,
          object_type:type === 4 ? "outpost" : "castle"
        });
      }
    }
  }
  return result;
}
const groupKey = r => [r.member_id,r.kingdom_code,r.type_code].join(":");
function diffObjects(previous, current, kind) {
  const before = new Map(), after = new Map();
  for (const r of previous) if (r.object_type === kind) { const k=groupKey(r); before.set(k,[...(before.get(k)||[]),r]); }
  for (const r of current) if (r.object_type === kind) { const k=groupKey(r); after.set(k,[...(after.get(k)||[]),r]); }
  const events=[];
  const keys=new Set([...before.keys(),...after.keys()]);
  for (const key of keys) {
    const oldRows=[...(before.get(key)||[])], newRows=[...(after.get(key)||[])];
    // Preserve exact object identity when available, then match remaining objects by nearest coordinates.
    const remainingOld=new Map(oldRows.map((r,i)=>[i,r]));
    const remainingNew=new Map(newRows.map((r,i)=>[i,r]));
    for (const [ni,n] of remainingNew) {
      const oi=[...remainingOld].find(([,o])=>o.object_id===n.object_id && o.x===n.x && o.y===n.y)?.[0];
      if (oi!==undefined) { remainingOld.delete(oi); remainingNew.delete(ni); }
    }
    if (remainingOld.size && remainingNew.size && remainingOld.size===remainingNew.size) {
      while (remainingOld.size) {
        const [ni,n]=remainingNew.entries().next().value;
        let best=null,dist=Infinity;
        for (const [oi,o] of remainingOld) { const d=(o.x-n.x)**2+(o.y-n.y)**2; if(d<dist){dist=d;best=oi;} }
        const o=remainingOld.get(best); remainingOld.delete(best); remainingNew.delete(ni);
        if (o.x!==n.x || o.y!==n.y || o.object_id!==n.object_id) events.push(event("moved",n,o));
      }
    } else {
      // A changed count is ambiguous (capture/loss/abandonment); never label it as a move.
      for (const n of remainingNew.values()) events.push(event("appeared",n,null));
      for (const o of remainingOld.values()) events.push(event("disappeared",o,null));
    }
  }
  return events;
}
function event(kind, row, previous) {
  return { id:`${kind}:${row.member_id}:${row.kingdom_code}:${row.type_code}:${now}:${row.object_id}`,
    kind, detected_at:now, source:"ain", ...row,
    ...(previous ? {previous:{object_id:previous.object_id,x:previous.x,y:previous.y}} : {}) };
}

const oldSnapshot=await read(paths.snapshots,null);
const payloads=[];
for (const cfg of ALLIANCES) {
  const data=await fetchAlliance(cfg.aid,{server:DEFAULT_SERVER});
  if (data.members.length < cfg.minMembers) fail(`AID ${cfg.aid}: tylko ${data.members.length} graczy (minimum ${cfg.minMembers})`);
  const prev=oldSnapshot?.alliances?.find(a=>Number(a.aid)===cfg.aid);
  if (prev?.members?.length && data.members.length < Math.max(cfg.minMembers,Math.floor(prev.members.length*0.7))) {
    fail(`AID ${cfg.aid}: podejrzany spadek liczby graczy ${prev.members.length} → ${data.members.length}`);
  }
  const pos=data.members.reduce((n,m)=>n+(m.ap?.length||0),0);
  const previousPositions=prev?.members?.reduce((n,m)=>n+(m.ap?.length||0),0);
  if (pos < cfg.minMembers) fail(`AID ${cfg.aid}: zbyt mało pozycji AP (${pos})`);
  if (previousPositions && pos < Math.floor(previousPositions * 0.75)) fail(`AID ${cfg.aid}: podejrzany spadek lokalizacji AP ${previousPositions} → ${pos}`);
  payloads.push(data);
}
const current=flatten(payloads);
if (!current.length) fail("Brak rozpoznanych lokalizacji — snapshot nie zostanie zmieniony.");
const previousRows=oldSnapshot ? flatten(oldSnapshot.alliances) : null;
const castleHistory=await read(paths.castles,{schema_version:1,server:DEFAULT_SERVER,updated_at:null,events:[]});
const outpostHistory=await read(paths.outposts,{schema_version:1,server:DEFAULT_SERVER,updated_at:null,events:[]});
if (!Array.isArray(castleHistory.events)||!Array.isArray(outpostHistory.events)) fail("Uszkodzony plik historii.");
if (previousRows) {
  castleHistory.events.push(...diffObjects(previousRows,current,"castle"));
  outpostHistory.events.push(...diffObjects(previousRows,current,"outpost"));
  castleHistory.events=castleHistory.events.slice(-20000);
  outpostHistory.events=outpostHistory.events.slice(-20000);
  castleHistory.updated_at=now; outpostHistory.updated_at=now;
  await write(paths.castles,castleHistory);
  await write(paths.outposts,outpostHistory);
} else {
  console.log("Brak snapshotu — zapisuję wyłącznie baseline, bez generowania zdarzeń.");
}
await write(paths.snapshots,{schema_version:1,server:DEFAULT_SERVER,captured_at:now,source:"ain",alliances:payloads.map(d=>({aid:d.alliance.aid,name:d.alliance.name,captured_at:d.captured_at,members:d.members.map(m=>({member_id:m.member_id,name:m.name,alliance_id:d.alliance.aid,alliance_name:d.alliance.name,ap:m.ap||[],vp:m.vp||[]}))}))});
console.log(JSON.stringify({ok:true,captured_at:now,alliances:payloads.map(d=>({aid:d.alliance.aid,members:d.counts.members,ap:d.counts.ap_positions})),tracked:current.length,castleEvents:castleHistory.events.length,outpostEvents:outpostHistory.events.length}));
