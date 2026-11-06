#!/usr/bin/env node
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Pinned upstream app.js shape mismatch: expected exactly one ${label}.`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

async function main() {
  const targetPath = process.argv[2];
  if (!targetPath) throw new Error('Usage: apply-bridge-patch.mjs <path-to-upstream-app.js>');
  const absolutePath = path.resolve(targetPath);
  const original = await readFile(absolutePath, 'utf8');
  const socketsPath = path.join(path.dirname(absolutePath), 'utils', 'ws', 'sockets.js');
  const socketsOriginal = await readFile(socketsPath, 'utf8');
  if (socketsOriginal.includes('EMPIRENEW_PL1_ONLY_SOCKET_SCOPE')) {
    throw new Error('Refusing to patch sockets.js that is already PL1-scoped.');
  }
  if (original.includes('createApiAuthMiddleware') || original.includes('createCommandQueue')) {
    throw new Error('Refusing to patch an app.js that already contains bridge middleware.');
  }

  let updated = original;
  updated = replaceExactlyOnce(updated,
    "const express = require('express');\n",
    "const express = require('express');\nconst { createApiAuthMiddleware } = require('./api-auth-middleware');\nconst { createCommandQueue } = require('./map-command-queue');\nconst { isAllowedReadOnlyCommand } = require('./read-only-commands');\n",
    'express import');
  updated = replaceExactlyOnce(updated,
    '    const app = express();\n',
    '    const app = express();\n    const runMapCommand = createCommandQueue();\n',
    'command queue initialization');
  updated = replaceExactlyOnce(updated,
    '        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");',
    '        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");',
    'CORS authorization header');
  updated = replaceExactlyOnce(updated,
    '    });\n\n    app.get("/:server/:command/:headers", async (req, res) => {',
    '    });\n\n    // Protect /status and all data routes; only GET / remains public for health checks.\n    app.use(createApiAuthMiddleware());\n\n    app.get("/:server/:command/:headers", async (req, res) => {\n        if (!isAllowedReadOnlyCommand(req.params.command)) {\n            return res.status(403).json({ error: "Command not allowed" });\n        }\n        if (req.params.server !== "EmpirefourkingdomsExGG_3") {\n            return res.status(403).json({ error: "Server not allowed" });\n        }',
    'route authentication middleware');

  const oldBlock = [
    '                    const messageHeaders = JSON.parse(`{${req.params.headers}}`);',
    '                    sockets[req.params.server].socket.sendJsonCommand(req.params.command, messageHeaders);',
    '',
    '                    let responseHeaders = {};',
    '                    if (req.params.command in commands) {',
    '                        for (const [messageKey, responsePath] of Object.entries(commands[req.params.command])) {',
    '                            if (messageKey in messageHeaders) {',
    '                                setNestedValue(responseHeaders, responsePath, messageHeaders[messageKey]);',
    '                            }',
    '                        }    ',
    '                    } else {',
    '                        responseHeaders = messageHeaders;',
    '                    }',
    '',
    '                    const response = await sockets[req.params.server].socket.waitForJsonResponse(req.params.command, responseHeaders, timeout = 1000);',
    '                    res.status(200).json({server: req.params.server, command: req.params.command, return_code: response.payload.status, content: response.payload.data});'
  ].join('\n');

  const newBlock = [
    '                    const messageHeaders = JSON.parse(`{${req.params.headers}}`);',
    '                    const executeCommand = async () => {',
    '                        sockets[req.params.server].socket.sendJsonCommand(req.params.command, messageHeaders);',
    '',
    '                        let responseHeaders = {};',
    '                        if (["gaa", "fnm"].includes(req.params.command)) {',
    '                            // Map replies do not have to echo request parameters.',
    '                            // BaseSocket treats false as command-only matching.',
    '                            responseHeaders = false;',
    '                        } else if (req.params.command in commands) {',
    '                            for (const [messageKey, responsePath] of Object.entries(commands[req.params.command])) {',
    '                                if (messageKey in messageHeaders) {',
    '                                    setNestedValue(responseHeaders, responsePath, messageHeaders[messageKey]);',
    '                                }',
    '                            }',
    '                        } else {',
    '                            responseHeaders = messageHeaders;',
    '                        }',
    '',
    '                        const responseTimeout = ["gaa", "fnm"].includes(req.params.command) ? 15000 : 1000;',
    '                        return await sockets[req.params.server].socket.waitForJsonResponse(',
    '                            req.params.command,',
    '                            responseHeaders,',
    '                            responseTimeout',
    '                        );',
    '                    };',
    '',
    '                    const isMapCommand = ["gaa", "fnm"].includes(req.params.command);',
    '                    const response = isMapCommand',
    '                        ? await runMapCommand(`${req.params.server}:${req.params.command}`, executeCommand)',
    '                        : await executeCommand();',
    '                    res.status(200).json({server: req.params.server, command: req.params.command, return_code: response.payload.status, content: response.payload.data});'
  ].join('\n');
  updated = replaceExactlyOnce(updated, oldBlock, newBlock, 'command response block');
  updated = replaceExactlyOnce(updated,
    '                    console.log(error.message);',
    "                    console.log('Bridge command failed:', error?.name || 'Error');",
    'error log redaction');

  if (!updated.includes('app.use(createApiAuthMiddleware())') ||
      !updated.includes('isAllowedReadOnlyCommand(req.params.command)') ||
      !updated.includes('Command not allowed') ||
      !updated.includes('req.params.server !== "EmpirefourkingdomsExGG_3"') ||
      !updated.includes('Server not allowed') ||
      !updated.includes('responseHeaders = false;') ||
      !updated.includes('responseTimeout') ||
      updated.includes('console.log(error.message)')) {
    throw new Error('Patched app.js failed postcondition checks.');
  }

  let socketsUpdated = socketsOriginal;
  socketsUpdated = replaceExactlyOnce(socketsUpdated,
    [
      '        for (const server of data.network.instances.instance) {',
      '            const socket = new E4kSocket(`tcp://${server.server}:443`, server.zone, process.env.USERNAME, process.env.PASSWORD);',
      '            sockets[server.zone] = socket;',
      '        }'
    ].join('\n'),
    [
      '        for (const server of data.network.instances.instance) {',
      '            if (server.zone !== "EmpirefourkingdomsExGG_3") continue;',
      '            const socket = new E4kSocket(`tcp://${server.server}:443`, server.zone, process.env.USERNAME, process.env.PASSWORD);',
      '            sockets[server.zone] = socket;',
      '        }'
    ].join('\n'),
    'E4K PL1 socket filter');
  socketsUpdated = replaceExactlyOnce(socketsUpdated,
    [
      'async function getSockets() {',
      '    return { ...await getGgeSockets(), ...await getE4kSockets() };',
      '}'
    ].join('\n'),
    [
      'async function getSockets() {',
      '    // EMPIRENEW_PL1_ONLY_SOCKET_SCOPE: never create/connect other game sockets.',
      '    const sockets = await getE4kSockets();',
      '    if (Object.keys(sockets).length !== 1 || !sockets["EmpirefourkingdomsExGG_3"]) {',
      '        throw new Error("Expected exactly one production PL1 socket.");',
      '    }',
      '    return sockets;',
      '}'
    ].join('\n'),
    'PL1-only socket selection');
  if (!socketsUpdated.includes('EMPIRENEW_PL1_ONLY_SOCKET_SCOPE') ||
      !socketsUpdated.includes('server.zone !== "EmpirefourkingdomsExGG_3"') ||
      !socketsUpdated.includes('Expected exactly one production PL1 socket.') ||
      socketsUpdated.includes('return { ...await getGgeSockets(), ...await getE4kSockets() };')) {
    throw new Error('Patched sockets.js failed PL1-only postcondition checks.');
  }

  const socketsTemporaryPath = `${socketsPath}.tmp`;
  await writeFile(socketsTemporaryPath, socketsUpdated, 'utf8');
  const temporaryPath = `${absolutePath}.tmp`;
  await writeFile(temporaryPath, updated, 'utf8');
  await rename(socketsTemporaryPath, socketsPath);
  await rename(temporaryPath, absolutePath);
  process.stdout.write(JSON.stringify({
    patched: true,
    target: path.basename(absolutePath),
    authentication: 'Bearer middleware enabled',
    target_server: 'EmpirefourkingdomsExGG_3',
    socket_scope: 'PL1 only; no other GGE/E4K sockets are connected',
    map_commands: ['gaa', 'fnm'],
    read_only_commands: ['gaa', 'fnm', 'gam'],
    rejected_commands_status: 403,
    map_response_match: 'command_only',
    map_timeout_ms: 15000,
    error_log: 'type_only'
  }) + '\n');
}

main().catch((error) => {
  process.stderr.write(`Bridge patch stopped safely: ${error?.name || 'Error'}: ${error?.message || error}\n`);
  process.exitCode = 1;
});
