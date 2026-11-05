#!/usr/bin/env node
import { createRequire } from 'node:module';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PL1_ZONE,
  extractNpcBattleReportEvidence,
  selectLatestNpcBattleReportMessages,
  validateMapOnlyCatalog,
} from './probe-core.mjs';
import { prepareE4kData } from './prepare-e4k-data.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CATALOG = path.join(ROOT, 'data', 'baron-fortresses.json');

function parseArgs(argv) {
  const args = { limit: 25, zone: process.env.E4K_ZONE || DEFAULT_PL1_ZONE };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value === '--limit') args.limit = Number(argv[++i]);
    else if (value === '--zone') args.zone = String(argv[++i] || '');
    else if (value === '--help') args.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100) {
    throw new Error('--limit must be an integer from 1 to 100.');
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      'Read-only PL1 mailbox report probe. Credentials: E4K_USERNAME/E4K_PASSWORD. ' +
      'Use --limit 25 to limit NPC boss-dungeon reports. No report data is persisted. ' +
      'Report delivery time is not the exact attack start time.\n'
    );
    return 0;
  }

  const username = process.env.E4K_USERNAME;
  const password = process.env.E4K_PASSWORD;
  if (!username || !password) {
    throw new Error('Set E4K_USERNAME and E4K_PASSWORD locally. Never put credentials in GitHub Actions or source files.');
  }

  const compatibility = await prepareE4kData();
  const { E4KClient } = require('ggejs');
  const { network } = require('e4k-data');
  const instance = network?.instances?.find((item) => item.zone === args.zone);
  if (
    !instance || args.zone !== DEFAULT_PL1_ZONE ||
    instance.server !== 'e4k-live-pl1-game.goodgamestudios.com' ||
    instance.value !== 3 || instance.zoneId !== 259 ||
    instance.instanceLocaId !== 'generic_country_PL'
  ) {
    throw new Error(`Refusing non-production-PL1 endpoint: ${args.zone}.`);
  }

  const ggejsRoot = path.dirname(require.resolve('ggejs'));
  const { showMessages } = require(path.join(ggejsRoot, 'commands', 'sne.js'));
  if (typeof showMessages !== 'function') throw new Error('Pinned ggejs does not expose the SNE mailbox reader.');

  const catalog = JSON.parse(await readFile(CATALOG, 'utf8'));
  const groups = validateMapOnlyCatalog(catalog);
  const coordinateIds = new Map();
  for (const points of Object.values(groups)) {
    for (const point of points) coordinateIds.set(`${point.kid}:${point.x}:${point.y}`, point.id);
  }

  const client = new E4KClient(instance);
  client.socketManager.reconnectTimeout = -1;
  try {
    await client.connect(username, password);
    const returnedMessages = await showMessages(client);
    const messages = Array.isArray(returnedMessages)
      ? returnedMessages
      : (Array.isArray(client.mailMessages) ? client.mailMessages : []);
    const npcReports = selectLatestNpcBattleReportMessages(messages, args.limit);

    const evidence = [];
    const rejectedReports = [];
    const detailErrors = [];
    for (let index = 0; index < npcReports.length; index++) {
      const message = npcReports[index];
      try {
        const battleLog = await message.getBattleLog();
        const item = extractNpcBattleReportEvidence(message, battleLog);
        if (!item) {
          rejectedReports.push({
            message_id: Number.isSafeInteger(Number(message.messageId)) ? Number(message.messageId) : null,
            reason: 'battle-log target, owner or participants did not pass cross-validation',
          });
        } else {
          const key = `${item.target.kid}:${item.target.x}:${item.target.y}`;
          evidence.push({
            ...item,
            target: { ...item.target, catalog_id_it1: coordinateIds.get(key) || null },
          });
        }
      } catch (error) {
        detailErrors.push({
          message_id: Number.isSafeInteger(Number(message.messageId)) ? Number(message.messageId) : null,
          error_type: error?.constructor?.name || 'Error',
        });
      }
      if (index + 1 < npcReports.length) await sleep(250);
    }

    process.stdout.write(JSON.stringify({
      mode: 'mailbox_npc_battle_report_read_only',
      target_server: 'E4K PL1 production',
      server_zone: args.zone,
      server_host: instance.server,
      dependency_compatibility: compatibility,
      mailbox_messages_returned: messages.length,
      npc_boss_dungeon_reports_selected: npcReports.length,
      reports_with_cross_validated_target_and_attacker: evidence.length,
      rejected_reports: rejectedReports,
      detail_errors: detailErrors,
      evidence,
      coverage: 'Only battle reports in the authenticated account mailbox; this is not a global PL1 feed.',
      attack_time_status: 'Not present in the parsed report fields. report_delivery_time_estimate_utc is an estimated mailbox delivery timestamp, not the attack start time.',
      persisted: false,
    }, null, 2) + '\n');
  } finally {
    try { await client.socketManager.disconnect(); } catch {}
  }
  return 0;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  process.stderr.write(`Barony mailbox report probe stopped safely: ${error?.constructor?.name || 'Error'}: ${error?.message || error}\n`);
  process.exitCode = 1;
});
