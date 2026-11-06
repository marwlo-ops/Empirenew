import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PATCHER = path.join(ROOT, 'bridge-deployment', 'apply-bridge-patch.mjs');

const UPSTREAM_APP = `const express = require('express');
const commands = require('./data/commands.json');
const { setNestedValue } = require('./utils/nestedHeaders');

module.exports = function (sockets) {
    const app = express();

    app.use((req, res, next) => {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Methods", "GET");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        next();
    });

    app.get("/:server/:command/:headers", async (req, res) => {
        if (req.params.server in sockets) {
            if (sockets[req.params.server] !== null && sockets[req.params.server].connected.isSet) {
                try {
                    const messageHeaders = JSON.parse(`{${String.fromCharCode(36)}{req.params.headers}}`);
                    sockets[req.params.server].socket.sendJsonCommand(req.params.command, messageHeaders);

                    let responseHeaders = {};
                    if (req.params.command in commands) {
                        for (const [messageKey, responsePath] of Object.entries(commands[req.params.command])) {
                            if (messageKey in messageHeaders) {
                                setNestedValue(responseHeaders, responsePath, messageHeaders[messageKey]);
                            }
                        }    
                    } else {
                        responseHeaders = messageHeaders;
                    }

                    const response = await sockets[req.params.server].socket.waitForJsonResponse(req.params.command, responseHeaders, timeout = 1000);
                    res.status(200).json({server: req.params.server, command: req.params.command, return_code: response.payload.status, content: response.payload.data});
                } catch (error) {
                    console.log(error.message);
                    res.status(400).json({ error: "Invalid command or headers" });
                }
            } else {
                res.status(500).json({ error: "Server not connected" });
            }
        } else {
            res.status(404).json({ error: "Server not found" });
        }
    });

    app.get("/status", (req, res) => {
        const status = {};
        for (const [server, socket] of Object.entries(sockets)) {
            status[server] = socket.connected.isSet;
        }
        res.status(200).json(status);
    });

    app.get("/", (req, res) => res.status(200).send("API running"));

    return app;
}`;

function loadPatchedApp(source) {
  const routes = new Map();
  const app = {
    use() {},
    get(route, handler) { routes.set(route, handler); return this; },
  };
  const mockRequire = (id) => {
    if (id === 'express') return () => app;
    if (id === './data/commands.json') return {};
    if (id === './utils/nestedHeaders') return {
      setNestedValue(target, key, value) { target[key] = value; },
    };
    throw new Error('Unexpected require: ' + id);
  };
  const moduleObject = { exports: {} };
  new Function('require', 'module', 'exports', source)(mockRequire, moduleObject, moduleObject.exports);
  return { createApp: moduleObject.exports, route: routes.get('/:server/:command/:headers') };
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

test('patched bridge rejects write-capable commands and non-PL1 server before sending anything', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'empirenew-bridge-'));
  try {
    const appPath = path.join(directory, 'app.js');
    await writeFile(appPath, UPSTREAM_APP, 'utf8');
    const patched = spawnSync(process.execPath, [PATCHER, appPath], { encoding: 'utf8' });
    assert.equal(patched.status, 0, patched.stderr || patched.stdout);

    const syntax = spawnSync(process.execPath, ['--check', appPath], { encoding: 'utf8' });
    assert.equal(syntax.status, 0, syntax.stderr);

    const source = await readFile(appPath, 'utf8');
    const allowlistAt = source.indexOf('const allowedReadOnlyCommands');
    const sendAt = source.indexOf('sendJsonCommand');
    assert.ok(allowlistAt >= 0 && allowlistAt < sendAt, 'allowlist must run before socket dispatch');
    assert.ok(source.includes('req.params.server !== "EmpirefourkingdomsExGG_3"'));

    const { createApp, route } = loadPatchedApp(source);
    const sent = [];
    const socket = {
      connected: { isSet: true },
      socket: {
        sendJsonCommand(command, headers) { sent.push({ command, headers }); },
        async waitForJsonResponse() { return { payload: { status: 0, data: { ok: true } } }; },
      },
    };
    createApp({ EmpirefourkingdomsExGG_3: socket, OtherServer: socket });

    const blockedCommandResponse = responseRecorder();
    await route({ params: { server: 'EmpirefourkingdomsExGG_3', command: 'attack', headers: ' ' } }, blockedCommandResponse);
    assert.equal(blockedCommandResponse.statusCode, 403);
    assert.deepEqual(blockedCommandResponse.body, { error: 'Command not allowed' });
    assert.equal(sent.length, 0);

    const blockedServerResponse = responseRecorder();
    await route({ params: { server: 'OtherServer', command: 'gam', headers: ' ' } }, blockedServerResponse);
    assert.equal(blockedServerResponse.statusCode, 403);
    assert.deepEqual(blockedServerResponse.body, { error: 'Server not allowed' });
    assert.equal(sent.length, 0);

    const allowedResponse = responseRecorder();
    await route({ params: { server: 'EmpirefourkingdomsExGG_3', command: 'gam', headers: ' ' } }, allowedResponse);
    assert.equal(allowedResponse.statusCode, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].command, 'gam');

    const secondPatch = spawnSync(process.execPath, [PATCHER, appPath], { encoding: 'utf8' });
    assert.notEqual(secondPatch.status, 0);
    assert.match(secondPatch.stderr, /already contains bridge middleware/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
