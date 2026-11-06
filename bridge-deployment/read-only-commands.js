'use strict';

// This bridge is dedicated to Barony's read-only map and movement diagnostics.
// Keep the allowlist intentionally narrow: never forward arbitrary game commands.
const READ_ONLY_COMMANDS = new Set(['gaa', 'fnm', 'gam']);

function isAllowedReadOnlyCommand(command) {
  return typeof command === 'string' && READ_ONLY_COMMANDS.has(command);
}

module.exports = { isAllowedReadOnlyCommand };
