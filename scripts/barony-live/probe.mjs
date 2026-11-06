#!/usr/bin/env node
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PL1_ZONE, buildGamProbeSummary, buildObservation, buildScanPlan, compareObservations,
  extractNpcBattleReportEvidence, extractParsedOutboundBossDungeonMovementEvidence,
  isGgejsGamDispatchStack, parseGgejsCommandResponseEnvelope, parseGgejsBattleLogShortResponse,
  parseGgejsBattleLogMiddleTimeResponse,
  selectLatestNpcBattleReportMessages, stateKey } from './probe-core.mjs';
import { prepareE4kData } from './prepare-e4k-data.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CATALOG = path.join(ROOT, 'data', 'baron-fortresses.json');
const DEFAULT_STATE = path.join(homedir(), '.cache', 'empirenew', 'barony-pl1-boss-dungeon-state.json');

function argsOf(argv) {
  const a = { all:false, plan:false, noState:false, movements:false, reports:false, reportLimit:10, reportWaitMs:3000, samples:3, delay:1000, movementWaitMs:5000,
    zone:process.env.E4K_ZONE || DEFAULT_PL1_ZONE,
    stateFile:process.env.BARONY_STATE_FILE || DEFAULT_STATE };
  for (let i=0;i<argv.length;i++) {
    const v=argv[i];
    if (v==='--all') a.all=true;
    else if (v==='--plan') a.plan=true;
    else if (v==='--no-state') a.noState=true;
    else if (v==='--movements') a.movements=true;
    else if (v==='--reports') a.reports=true;
    else if (v==='--report-limit') a.reportLimit=Number(argv[++i]);
    else if (v==='--report-wait-ms') a.reportWaitMs=Number(argv[++i]);
    else if (v==='--movement-wait-ms') a.movementWaitMs=Number(argv[++i]);
    else if (v==='--samples-per-kingdom') a.samples=Number(argv[++i]);
    else if (v==='--delay-ms') a.delay=Number(argv[++i]);
    else if (v==='--zone') a.zone=String(argv[++i] || '');
    else if (v==='--state-file') a.stateFile=String(argv[++i] || '');
    else if (v==='--help') a.help=true;
    else throw new Error(`Unknown argument: ${v}`);
  }
  if (!Number.isInteger(a.samples) || a.samples<1 || a.samples>10) throw new Error('--samples-per-kingdom must be 1..10.');
  if (!Number.isInteger(a.delay) || a.delay<1000) throw new Error('--delay-ms must be at least 1000.');
  if (!Number.isInteger(a.movementWaitMs) || a.movementWaitMs<1000 || a.movementWaitMs>10000) throw new Error('--movement-wait-ms must be 1000..10000.');
  if (!Number.isInteger(a.reportLimit) || a.reportLimit<1 || a.reportLimit>25) throw new Error('--report-limit must be 1..25.');
  if (!Number.isInteger(a.reportWaitMs) || a.reportWaitMs<1000 || a.reportWaitMs>10000) throw new Error('--report-wait-ms must be 1000..10000.');
  if (!a.stateFile) throw new Error('--state-file cannot be empty.');
  return a;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function readState(file) {
  try {
    const s=JSON.parse(await readFile(file,'utf8'));
    if (s.schema_version!==2 || !s.last_observations || typeof s.last_observations!=='object') throw new Error('Invalid state schema; refusing to overwrite.');
    return s;
  } catch(e) {
    if (e.code==='ENOENT') return {schema_version:2,source:'E4K PL1 live map observations',last_observations:{}};
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
    process.stdout.write('Read-only E4K PL1 probe. Default: 3 map samples per kingdom. Optional --movements requests a read-only GAM movement snapshot; --reports reads NPC battle reports and captures BLS.PS battle-age metadata from this account mailbox. BLS.PS/BLM.PS semantics are undocumented in pinned ggejs; numeric values are diagnostic only and no battle time is inferred. Credentials: E4K_USERNAME/E4K_PASSWORD. Use --plan --all to preview the full sector plan. No exact attack time is inferred.\n');
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

  const compatibility=await prepareE4kData();
  const {E4KClient}=require('ggejs');
  const {network}=require('e4k-data');
  const instance=network?.instances?.find(x=>x.zone===a.zone);
  if (!instance) throw new Error(`Zone ${a.zone} is absent from pinned e4k-data network list.`);
  if (a.zone!==DEFAULT_PL1_ZONE || instance.server!=='e4k-live-pl1-game.goodgamestudios.com' || instance.value!==3 || instance.zoneId!==259 || instance.instanceLocaId!=='generic_country_PL') {
    throw new Error(`Refusing non-production-PL1 endpoint: ${a.zone} / ${instance.server}.`);
  }

  const stateFile=path.resolve(a.stateFile);
  const state=a.noState?{schema_version:2,last_observations:{}}:await readState(stateFile);
  const client=new E4KClient(instance);
  client.socketManager.reconnectTimeout=-1;
  const originalAddOrUpdate=client.movements._add_or_update;
  const originalOnSocketMessage=client.socketManager.onSocketMessage;
  const movementGamBatches=[];
  const movementGamResponseStatuses=[];
  const battleLogShortResponses=[];
  const battleLogMiddleResponses=[];
  let activeReportMessageId=null;
  let latestGamResponseMeta=null;
  let ignoredNonGamMovementUpdates=0;
  let movementObservationPhase = 'pre_request';
  if (a.movements || a.reports) {
    // Capture only small response metadata. BLS.PS/BLM.PS are retained only as unverified numeric diagnostics;
    // the raw account payload and report contents are never stored.
    client.socketManager.onSocketMessage=function(clientArg,message) {
      const receivedAt=new Date().toISOString();
      const parsed=parseGgejsCommandResponseEnvelope(message);
      latestGamResponseMeta=parsed?.command==='gam'
        ? {...parsed,connection_zone:a.zone,phase:movementObservationPhase,received_at_utc:receivedAt}
        : null;
      if (latestGamResponseMeta) movementGamResponseStatuses.push(latestGamResponseMeta);
      const shortLog=parseGgejsBattleLogShortResponse(message,receivedAt);
      if (shortLog) battleLogShortResponses.push(shortLog);
      const middleLog=parseGgejsBattleLogMiddleTimeResponse(message,receivedAt,activeReportMessageId);
      if (middleLog) battleLogMiddleResponses.push(middleLog);
      return originalOnSocketMessage.call(this,clientArg,message);
    };
  }
  if (a.movements) {
    // Only count updates dispatched by commands/gam.js; CRA/CRM/CSM also update this manager.
    client.movements._add_or_update=function(items) {
      const receivedAt=new Date().toISOString();
      const stack=new Error().stack||'';
      if (isGgejsGamDispatchStack(stack)) {
        const batch=Array.isArray(items)?items:[];
        movementGamBatches.push({
          phase:movementObservationPhase,
          received_at_utc:receivedAt,
          movement_count:batch.length,
          response_error_code:latestGamResponseMeta?.error_code??null,
          response_ok:latestGamResponseMeta?.ok??null,
          response_received_at_utc:latestGamResponseMeta?.received_at_utc??null,
          evidence:batch.map(m=>extractParsedOutboundBossDungeonMovementEvidence(m,receivedAt)).filter(Boolean),
        });
      } else {
        ignoredNonGamMovementUpdates++;
      }
      return originalAddOrUpdate.call(this,items);
    };
  }
  const observations=[],candidateSignals=[],sectorErrors=[];
  let movementProbe={status:'not_requested',gam_response_batches:0,ignored_non_gam_movement_updates:0,movement_count:0,matching_count:0};
  let movementEvidence=[];
  let movementPreRequestEvidence=[];
  let mailboxUpdateObserved=false;
  const onMailMessageAdd=()=>{mailboxUpdateObserved=true;};
  if (a.reports) client.on('mailMessageAdd',onMailMessageAdd);
  let reportProbe={status:'not_requested',mailbox_total_messages:0,npc_reports_selected:0,battle_logs_loaded:0,evidence_count:0,fetch_errors:0,rejected_reports:0};
  let reportEvidence=[];
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

    if (a.movements) {
      const preRequestBatches=movementGamBatches.filter(batch=>batch.phase==='pre_request');
      movementObservationPhase='request';
      const requestSentAt=new Date().toISOString();
      let requestSent=false,requestError=null,collectionComplete=false,timedOut=false;
      try {
        requestSent=client.socketManager.sendCommand('gam',{})===true;
        if (!requestSent) requestError='SocketManager.sendCommand returned false';
      } catch (error) {
        requestError=String(error?.message||error).slice(0,240);
      }

      if (requestSent) {
        const firstResponseDeadline=Date.now()+a.movementWaitMs;
        while (!movementGamBatches.some(batch=>batch.phase==='request') && Date.now()<firstResponseDeadline) await sleep(50);
        let responseBatches=movementGamBatches.filter(batch=>batch.phase==='request');
        if (responseBatches.length===0) {
          timedOut=true;
        } else {
          let observedCount=responseBatches.length;
          let lastBatchAt=Date.now();
          const collectionDeadline=Date.now()+Math.min(10000,Math.max(1000,a.movementWaitMs));
          while (Date.now()<collectionDeadline) {
            const currentCount=movementGamBatches.filter(batch=>batch.phase==='request').length;
            if (currentCount!==observedCount) {
              observedCount=currentCount;
              lastBatchAt=Date.now();
            }
            if (Date.now()-lastBatchAt>=250) {
              collectionComplete=true;
              break;
            }
            await sleep(50);
          }
          responseBatches=movementGamBatches.filter(batch=>batch.phase==='request');
          if (!collectionComplete) timedOut=true;
        }
      }
      movementObservationPhase='post_request';
      const responseBatches=movementGamBatches.filter(batch=>batch.phase==='request');
      const sampledAt=new Date().toISOString();
      const gamResult=buildGamProbeSummary({
        requestSent,preRequestBatches,responseBatches,ignoredNonGamMovementUpdates,
        requestSentAt,sampledAt,collectionComplete,timedOut,requestError,
        responseStatuses:movementGamResponseStatuses,responseStatusCaptureEnabled:true,
      });
      movementProbe=gamResult.summary;
      movementEvidence=gamResult.evidence;
      movementPreRequestEvidence=gamResult.pre_request_evidence;
    }

    if (a.reports) {
      // SNE is requested by ggejs during GBD. Fetch only full details for matching NPC reports.
      await sleep(a.reportWaitMs);
      const mailbox=Array.isArray(client.mailMessages)?client.mailMessages:[];
      const reportMessages=selectLatestNpcBattleReportMessages(mailbox,a.reportLimit);
      let battleLogsLoaded=0,fetchErrors=0,rejectedReports=0;
      for (const message of reportMessages) {
        try {
          if (typeof message.getBattleLog!=='function') { rejectedReports++; continue; }
          const reportMessageId=Number(message.messageId);
          activeReportMessageId=Number.isSafeInteger(reportMessageId) && reportMessageId>0 ? reportMessageId : null;
          let battleLog;
          try { battleLog=await message.getBattleLog(); }
          finally { activeReportMessageId=null; }
          if (battleLog) battleLogsLoaded++;
          const shortLogTimeEvidence=battleLogShortResponses.slice().reverse().find(item =>
            item.message_id===reportMessageId && item.battle_log_id===Number(battleLog?.battleLogId));
          const middleLogTimeEvidence=battleLogMiddleResponses.slice().reverse().find(item =>
            item.message_id===reportMessageId && item.battle_log_id===Number(battleLog?.battleLogId));
          const evidence=extractNpcBattleReportEvidence(message,battleLog,shortLogTimeEvidence,middleLogTimeEvidence);
          if (evidence) reportEvidence.push(evidence);
          else rejectedReports++;
        } catch {
          fetchErrors++;
        }
      }
      reportProbe={
        status:mailboxUpdateObserved?'mailbox_update_observed':(mailbox.length?'mailbox_data_present':'mailbox_update_not_observed'),
        sampled_at_utc:new Date().toISOString(),
        mailbox_total_messages:mailbox.length,
        npc_reports_selected:reportMessages.length,
        battle_logs_loaded:battleLogsLoaded,
        battle_log_short_responses_with_ps:battleLogShortResponses.filter(item=>item.ps_value_unverified!==null).length,
        battle_log_middle_responses_with_ps:battleLogMiddleResponses.filter(item=>item.ps_value_unverified!==null).length,
        battle_time_estimates:reportEvidence.filter(item=>item.battle_time_estimate_utc).length,
        battle_time_cross_checked:reportEvidence.filter(item=>item.battle_time_source==='BLS.PS+BLM.PS_cross_checked').length,
        evidence_count:reportEvidence.length,
        fetch_errors:fetchErrors,
        rejected_reports:rejectedReports,
        coverage:'Only reports present in this authenticated account mailbox; not a global PL1 history.',
      };
    }
  } finally {
    if (a.reports) client.off('mailMessageAdd',onMailMessageAdd);
    if (a.movements) client.movements._add_or_update=originalAddOrUpdate;
    if (a.movements || a.reports) client.socketManager.onSocketMessage=originalOnSocketMessage;
    try { await client.socketManager.disconnect(); } catch {}
  }

  if (!a.noState) {
    state.updated_at_utc=new Date().toISOString();
    state.server_zone=a.zone;
    state.server_host=instance.server;
    state.note='Raw verified BossDungeonMapobject type 11 observations only. Candidate signals are not persisted as confirmed attacks.';
    await writeState(stateFile,state);
  }
  const deployTime=Number(network.deployTime);
  process.stdout.write(JSON.stringify({
    mode:'live_read_only_map_probe',target_server:'E4K PL1 production',
    server_zone:a.zone,server_host:instance.server,server_instance_id:instance.value,server_zone_id:instance.zoneId,instance_loca_id:instance.instanceLocaId,
    network_version_no:network.versionNo??null,
    network_deploy_time_utc:Number.isFinite(deployTime)?new Date(deployTime*1000).toISOString():null,
    source:'ggejs 2.2.0 + e4k-data 4.144.21-788.RC.3',
    dependency_compatibility:compatibility,
    selection:a.all?'all_catalog_targets':`${a.samples}_samples_per_kingdom`,
    summary:{
      requested_targets:plan.summary.target_count,sectors_requested:plan.summary.sector_count,
      fortress_rows_found:observations.filter(x=>x.status==='fortress_row_found').length,
      defeater_ids_observed:observations.filter(x=>Number.isInteger(x.defeater_player_id)&&x.defeater_player_id>0).length,
      cooldown_active:observations.filter(x=>x.cooldown_active===true).length,
      unverified_or_missing:observations.filter(x=>['not_confirmed','coordinate_row_unverified','ambiguous_duplicate_rows'].includes(x.status)).length,
      request_errors:sectorErrors.length,candidate_signals:candidateSignals.length,
      outbound_boss_dungeon_movements:movementEvidence.length,
      npc_battle_report_evidence:reportEvidence.length,
      npc_battle_report_time_estimates:reportEvidence.filter(item=>item.battle_time_estimate_utc).length
    },
    observations,candidate_signals:candidateSignals,sector_errors:sectorErrors,
    movement_probe:movementProbe,movement_evidence:movementEvidence,movement_pre_request_evidence:movementPreRequestEvidence,
    mailbox_report_probe:reportProbe,mailbox_report_evidence:reportEvidence,
    state_file:a.noState?null:stateFile,
    attack_history_status:'optional_account_scoped_mailbox_and_movement_evidence; BLS_BLM_PS_semantics_unverified; no_global_PL1_history; exact_attack_launch_time_unavailable',
    warning:'Map rows contain no exact attacked_at. Optional GAM snapshots cover only movements returned to this account; optional NPC battle reports cover only this account mailbox. BLS.PS/BLM.PS semantics are undocumented in pinned ggejs and are not converted into a battle-time estimate; no global PL1 history is persisted.'
  },null,2)+'\n');
  return 0;
}

main().then(code=>{process.exitCode=code;}).catch(e=>{
  process.stderr.write(`Barony probe stopped safely: ${e?.constructor?.name||'Error'}: ${e?.message||e}\n`);
  process.exitCode=1;
});
