import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const patchScript = await readFile(new URL('./apply-bridge-patch.mjs', import.meta.url), 'utf8');
const environment = await readFile(new URL('./ENVIRONMENT.md', import.meta.url), 'utf8');
const render = await readFile(new URL('./render.yaml', import.meta.url), 'utf8');

test('guarded patch script rejects changed or already patched upstream files', () => {
  assert.match(patchScript, /replaceExactlyOnce/);
  assert.match(patchScript, /Refusing to patch an app\\.js that already contains bridge middleware/);
  assert.match(patchScript, /Pinned upstream app\\.js shape mismatch/);
});

test('patch script redacts upstream error details', () => {
  assert.match(patchScript, /Bridge command failed/);
  assert.doesNotMatch(patchScript, /console\\.log\\(error\\.message\\)/);
  assert.match(patchScript, /error_log: 'type_only'/);
});

test('map commands use command-only response matching and a 15 second timeout', () => {
  assert.match(patchScript, /responseHeaders = false/);
  assert.match(patchScript, /responseTimeout/);
  assert.match(patchScript, /runMapCommand/);
});

test('deployment template keeps credentials as unsynced secrets', () => {
  for (const key of ['USERNAME', 'PASSWORD', 'EMPIRE_API_TOKEN']) {
    const index = render.indexOf('key: ' + key);
    assert.notEqual(index, -1);
    assert.match(render.slice(index, index + 80), /sync: false/);
  }
  assert.match(environment, /nigdy w plikach repozytorium/i);
});
