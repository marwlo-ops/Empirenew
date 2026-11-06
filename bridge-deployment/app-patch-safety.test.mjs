import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const patchScript = await readFile(new URL('./apply-bridge-patch.mjs', import.meta.url), 'utf8');
const environment = await readFile(new URL('./ENVIRONMENT.md', import.meta.url), 'utf8');
const render = await readFile(new URL('./render.yaml', import.meta.url), 'utf8');

test('guarded patch script rejects changed or already patched upstream files', () => {
  assert.ok(patchScript.includes('replaceExactlyOnce'));
  assert.ok(patchScript.includes('Refusing to patch an app.js that already contains bridge middleware.'));
  assert.ok(patchScript.includes('Pinned upstream app.js shape mismatch: expected exactly one'));
});

test('patch script redacts upstream error details', () => {
  assert.ok(patchScript.includes("console.log('Bridge command failed:', error?.name || 'Error');"));
  assert.ok(patchScript.includes("error_log: 'type_only'"));
});

test('map commands use command-only response matching and a 15 second timeout', () => {
  assert.ok(patchScript.includes('responseHeaders = false;'));
  assert.ok(patchScript.includes('responseTimeout'));
  assert.ok(patchScript.includes('runMapCommand'));
});

test('generated bridge rejects every command outside the narrow read-only allowlist', () => {
  assert.ok(patchScript.includes("require('./read-only-commands')"));
  assert.ok(patchScript.includes('isAllowedReadOnlyCommand(req.params.command)'));
  assert.ok(patchScript.includes('Command not allowed'));
  assert.ok(patchScript.includes("read_only_commands: ['gaa', 'fnm', 'gam']"));
});

test('patched bridge is scoped to the production PL1 server and socket only', () => {
  assert.ok(patchScript.includes('req.params.server !== "EmpirefourkingdomsExGG_3"'));
  assert.ok(patchScript.includes('Server not allowed'));
  assert.ok(patchScript.includes('EMPIRENEW_PL1_ONLY_SOCKET_SCOPE'));
  assert.ok(patchScript.includes('Expected exactly one production PL1 socket.'));
  assert.ok(environment.includes('EmpirefourkingdomsExGG_3'));
});

test('deployment template keeps credentials as unsynced secrets', () => {
  for (const key of ['USERNAME', 'PASSWORD', 'EMPIRE_API_TOKEN']) {
    const index = render.indexOf('key: ' + key);
    assert.notEqual(index, -1);
    assert.match(render.slice(index, index + 80), /sync: false/);
  }
  assert.ok(environment.includes('nigdy w plikach repozytorium'));
});
