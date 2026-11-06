import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const patch = await readFile(new URL('./app.js.patch', import.meta.url), 'utf8');
const environment = await readFile(new URL('./ENVIRONMENT.md', import.meta.url), 'utf8');
const render = await readFile(new URL('./render.yaml', import.meta.url), 'utf8');
const addedLines = patch.split('\n').filter((line) => line.startsWith('+'));

test('bridge patch never adds raw upstream error messages to logs or responses', () => {
  assert.ok(addedLines.some((line) => line.includes("console.log('Bridge command failed:', error?.name || 'Error')")));
  assert.ok(!addedLines.some((line) => line.includes('error.message')));
});

test('map commands use command-only response matching and bounded waits', () => {
  assert.ok(patch.includes('responseHeaders = false;'));
  assert.ok(patch.includes('waitForJsonResponse'));
  assert.ok(patch.includes('responseTimeout'));
  assert.ok(patch.includes('runMapCommand'));
});

test('deployment template keeps credentials as unsynced secrets', () => {
  for (const key of ['USERNAME', 'PASSWORD', 'EMPIRE_API_TOKEN']) {
    const index = render.indexOf('key: ' + key);
    assert.notEqual(index, -1);
    assert.match(render.slice(index, index + 80), /sync: false/);
  }
  assert.match(environment, /nigdy w plikach repozytorium/i);
});
