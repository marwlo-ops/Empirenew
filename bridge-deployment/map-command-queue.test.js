'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createCommandQueue } = require('./map-command-queue');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('serializes same-server same-command requests in arrival order', async () => {
  const run = createCommandQueue();
  const gate = deferred();
  const events = [];
  const first = run('pl1:gaa', async () => {
    events.push('first-start');
    await gate.promise;
    events.push('first-end');
    return 'first';
  });
  const second = run('pl1:gaa', async () => {
    events.push('second-start');
    return 'second';
  });
  await new Promise(setImmediate);
  assert.deepEqual(events, ['first-start']);
  gate.resolve();
  assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
  assert.deepEqual(events, ['first-start', 'first-end', 'second-start']);
});

test('allows different commands on the same server to run concurrently', async () => {
  const run = createCommandQueue();
  const gate = deferred();
  let started = 0;
  const a = run('pl1:gaa', async () => { started += 1; await gate.promise; return 'gaa'; });
  const b = run('pl1:fnm', async () => { started += 1; await gate.promise; return 'fnm'; });
  await new Promise(setImmediate);
  assert.equal(started, 2);
  gate.resolve();
  assert.deepEqual(await Promise.all([a, b]), ['gaa', 'fnm']);
});

test('a failed operation does not poison the next queued request', async () => {
  const run = createCommandQueue();
  await assert.rejects(run('pl1:gaa', async () => { throw new Error('expected failure'); }), /expected failure/);
  assert.equal(await run('pl1:gaa', async () => 'recovered'), 'recovered');
});
