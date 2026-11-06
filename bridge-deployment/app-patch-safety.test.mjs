import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const patch = await readFile(new URL('./app.js.patch', import.meta.url), 'utf8');
const environment = await readFile(new URL('./ENVIRONMENT.md', import.meta.url), 'utf8');
const render = await readFile(new URL('./render.yaml', import.meta.url), 'utf8');

test('bridge patch never logs raw upstream error messages', () => {
  assert.match(patch, /Bridge command failed/);
  assert.doesNotMatch(patch, /console\\.log\\(error\\.message\\)/);
  assert.doesNotMatch(patch, /json\\(\\{\\s*error:\\s*error\\.message/);
});

test('map commands use command-only response matching and bounded waits', () => {
  assert.match(patch, /responseHeaders = false/);
  assert.match(patch, /waitForJsonResponse/);
  assert.match(patch, /responseTimeout/);
  assert.match(patch, /runMapCommand/);
});

test('deployment template keeps credentials as unsynced secrets', () => {
  for (const key of ['USERNAME', 'PASSWORD', 'EMPIRE_API_TOKEN']) {
    assert.match(render, new RegExp('key: ' + key));
    assert.match(render, new RegExp('key: ' + key + '[\\\\s\\\\S]{0,40}sync: false'));
  }
  assert.match(environment, /never in repository files/i);
});
