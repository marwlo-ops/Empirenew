#!/usr/bin/env node
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PL1_ZONE, buildObservation, buildScanPlan, compareObservations, stateKey } from './probe-core.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CATALOG = path.join(ROOT, 'data', 'baron-fortresses.json');
const DEFAULT_STATE = path.join(homedir(), '.cache', 'empirenew', 'barony-pl1-state.json');

function argsOf(argv) {
  const a = { all:false, plan:false, noState:false, samples:3, delay:1000,
    zone:process.env.E4K_ZONE || DEFAULT_PL1_ZONE,
    stateFile:process.env.BARONY_STATE_FILE || DEFAULT_STATE };
  for (let i=0;i<argv.length;i++) {
    const v=argv[i];
    if (v==='--all') a.all=true;
    else if (v==='--plan') a.plan=true;
    else if (v==='--no-state') a.noState=true;
    else if (v==='--samples-per-kingdom') a.samples=Number(argv[++i]);
    else if (v==='--delay-ms') a.delay=Number(argv[++i]);
    else if (v==='--zone') a.zone=String(argv[++i] || '');
    else if (v==='--state-file') a.stateFile=String(argv[++i] || '');
    else if (v==='--help') a.help=true;
    else throw new Error(`Unknown argument: ${v}`);
  }
  if (!Number.isInteger(a.samples) || a.samples<1 || a.samples>10) throw new Error('--samples-per-kingdom must be 1..10.');
  if (!Number.isInteger(a.delay) || a.delay<1000) throw new Error('--delay-ms must be at least 1000.');
  if (!a.stateFile) throw new Error('--state-file cannot be empty.');
  return a;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function readState(file) {
  try {
    const s=JSON.parse(await readFile(file,'utf8'));
    if (s.schema_version!==1 || !s.last_observations || typeof s.last_observations!=='object') throw new Error('Invalid state schema; refusing to overwrite.');
    return s;
  } catch(e) {
    if (e.code==='ENOENT') return {schema_version:1,source:'E4K PL1 live map observations',last_observations:{}};
    throw e;
  }
}

async function writeState(file,state) {
  await mkdir(path.dirname(file),{recursive:true});
  const tmp=file+'.tmp';
  await writeFile(tmp,JSON.stringify(state,null,2)+'\n',{mode:0o600});
  await rename(tmp,file);
}

async function main() {
  const a=argsOf(process.argv.slice(2));
  if (a.help) {
    process.stdout.write('Read-only E4K PL1 map probe. Default: 3 samples per kingdom. Credentials: E4K_USERNAME/E4K_PASSWORD. Use --plan --all to preview the full sector plan. Candidate signals are intervals, never exact attack times.\n');
    return 0;
  }
  const catalog=JSON.parse(await readFile(CATALOG,'utf8'));
  const plan=buildScanPlan(catalog,{all:a.all,samplesPerKingdom:a.samples});
  if (a.plan) {
    process.stdout.write(JSON.stringify({
      mode:'plan_only_no_network',target_server_zone:a.zone,
      selection:a.all?'all_catalog_targets':`${a.samples}_samples_per_kingdom`,
      ...plan.summary,
      sectors:plan.sectors.map(s=>({kid:s.kid,kingdom:s.kingdom,sector_x:s.sector_x,sector_y:s.sector_y,center_x:s.center_x,center_y:s.center_y,target_count:s.targets.length})),
      note:'IT1 supplies coordinates only; a live PL1 map row is required to confirm each fortress.'
    },null,2)+'\n');
    return 0;
  }

  const username=process.env.E4K_USERNAME, password=process.env.E4K_PASSWORD;
  if (!username || !password) throw new Error('Set E4K_USERNAME and E4K_PASSWORD locally. Do not place credentials in GitHub Actions or send them in chat.');

  const {E4KClient}=require('ggejs');
  const {network}=require('e4k-data');
  const instance=network?.instances?.find(x=>x.zone===a.zone);
  if (!instance) throw new Error(`Zone ${a.zone} is absent from pinned e4k-data network list.`);
  if (a.zone!==DEFAULT_PL1_ZONE || instance.server!=='e4k-live-pl1-game.goodgamestudios.com' || instance.value!==3 || instance.zoneId!==259 || instance.instanceLocaId!=='generic_country_PL') {
    throw new Error(`Refusing non-production-PL1 endpoint: ${a.zone} / ${instance.server}.`);
  }

  const stateFile=path.resolve(a.stateFile);
  const state=a.noState?{schema_version:1,last_observations:{}}:await readState(stateFile);
  const client=new E4KClient(instance);
  client.socketManager.reconnectTimeout=-1;
  const observations=[],candidateSignals=[],sectorErrors=[];
  try {
    await client.connect(username,password);
    for (let i=0;i<plan.sectors.length;i++) {
      const sector=plan.sectors[i];
      if (i>0) await sleep(a.delay);
      try {
        const result=await client.worldMaps.getSector(sector.kid,sector.center_x,sector.center_y);
        // Timestamp the received snapshot, not the moment before the network request.
        const sampledAt=new Date().toISOString();
        const rows=Array.isArray(result?.mapObjects)?result.mapObjects:[];
        for (const target of sector.targets) {
          const observation=buildObservation(target,rows,sampledAt);
          observations.push(observation);
          if (observation.status!=='fortress_row_found') continue;
          const key=stateKey(target);
          candidateSignals.push(...compareObservations(state.last_observations[key],observation));
          state.last_observations[key]=observation;
        }
      } catch(e) {
        sectorErrors.push({kid:sector.kid,kingdom:sector.kingdom,sector_x:sector.sector_x,sector_y:sector.sector_y,error_type:e?.constructor?.name||'Error',message:String(e?.message||e).slice(0,300)});
        for (const target of sector.targets) observations.push({
          target:{catalog_id_it1:target.id,kid:target.kid,kingdom:target.kingdom,x:target.x,y:target.y},
          sampled_at_utc:new Date().toISOString(),status:'request_error',attack_time_utc:null
        });
      }
    }
  } finally {
    try { await client.socketManager.disconnect(); } catch {}
  }

  if (!a.noState) {
    state.updated_at_utc=new Date().toISOString();
    state.server_zone=a.zone;
    state.server_host=instance.server;
    state.note='Raw verified map observations only. Candidate signals are not persisted as confirmed attacks.';
    await writeState(stateFile,state);
  }
  const deployTime=Number(network.deployTime);
  process.stdout.write(JSON.stringify({
    mode:'live_read_only_map_probe',target_server:'E4K PL1 production',
    server_zone:a.zone,server_host:instance.server,server_instance_id:instance.value,server_zone_id:instance.zoneId,instance_loca_id:instance.instanceLocaId,
    network_version_no:network.versionNo??null,
    network_deploy_time_utc:Number.isFinite(deployTime)?new Date(deployTime*1000).toISOString():null,
    source:'ggejs 2.2.0 + e4k-data 4.144.21-788.RC.3',
    selection:a.all?'all_catalog_targets':`${a.samples}_samples_per_kingdom`,
    summary:{
      requested_targets:plan.summary.target_count,sectors_requested:plan.summary.sector_count,
      fortress_rows_found:observations.filter(x=>x.status==='fortress_row_found').length,
      unverified_or_missing:observations.filter(x=>['not_confirmed','coordinate_row_unverified','ambiguous_duplicate_rows'].includes(x.status)).length,
      request_errors:sectorErrors.length,candidate_signals:candidateSignals.length
    },
    observations,candidate_signals:candidateSignals,sector_errors:sectorErrors,
    state_file:a.noState?null:stateFile,
    attack_history_status:'not_confirmed_until_live_semantics_are_validated',
    warning:'No attacker or exact attacked_at timestamp is inferred. Candidate transitions are sample intervals only.'
  },null,2)+'\n');
  return 0;
}

main().then(code=>{process.exitCode=code;}).catch(e=>{
  process.stderr.write(`Barony probe stopped safely: ${e?.constructor?.name||'Error'}: ${e?.message||e}\n`);
  process.exitCode=1;
});
