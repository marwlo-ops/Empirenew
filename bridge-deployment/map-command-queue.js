'use strict';

function createCommandQueue() {
  const pending = new Map();

  return async function runQueuedCommand(key, operation) {
    const previous = pending.get(key) || Promise.resolve();
    const current = previous.catch(() => undefined).then(() => operation());
    pending.set(key, current);

    try {
      return await current;
    } finally {
      if (pending.get(key) === current) pending.delete(key);
    }
  };
}

module.exports = { createCommandQueue };
