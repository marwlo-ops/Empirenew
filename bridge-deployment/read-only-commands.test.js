'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { isAllowedReadOnlyCommand } = require('./read-only-commands');

test('allows only read-only map and movement commands required by Barony', () => {
  for (const command of ['gaa', 'fnm', 'gam']) {
    assert.equal(isAllowedReadOnlyCommand(command), true, command);
  }
});

test('rejects write, account, ranking and unknown commands', () => {
  for (const command of ['hgh', 'ain', 'wsp', 'slse', 'attack', 'login', '', 'GAA', null, undefined]) {
    assert.equal(isAllowedReadOnlyCommand(command), false, String(command));
  }
});
