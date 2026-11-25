'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { isAllowedReadOnlyCommand } = require('./read-only-commands');

test('allows read-only map, movement and account-info commands', () => {
  for (const command of ['gaa', 'fnm', 'gam', 'gpi']) assert.equal(isAllowedReadOnlyCommand(command), true, command);
});

test('rejects login, registration, password-change, write and unknown commands', () => {
  for (const command of ['hgh', 'ain', 'wsp', 'slse', 'attack', 'lli', 'lre', 'scp', 'login', '', 'GAA', null, undefined]) assert.equal(isAllowedReadOnlyCommand(command), false, String(command));
});
