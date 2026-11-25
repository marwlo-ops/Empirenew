'use strict';
const READ_ONLY_COMMANDS = new Set(['gaa', 'fnm', 'gam', 'gpi']);
function isAllowedReadOnlyCommand(command) { return typeof command === 'string' && READ_ONLY_COMMANDS.has(command); }
module.exports = { isAllowedReadOnlyCommand };
