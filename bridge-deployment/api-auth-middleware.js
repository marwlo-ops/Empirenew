'use strict';

const { timingSafeEqual } = require('node:crypto');

const MIN_TOKEN_BYTES = 32;

function createApiAuthMiddleware(options = {}) {
  const configuredToken = options.token ?? process.env.EMPIRE_API_TOKEN ?? '';
  const expected = Buffer.from(typeof configuredToken === 'string' ? configuredToken : '', 'utf8');
  const tokenConfigured = expected.length >= MIN_TOKEN_BYTES;

  return function apiAuthMiddleware(req, res, next) {
    // CORS preflight carries no application data. The actual GET remains protected.
    if (req.method === 'OPTIONS') return res.sendStatus(204);

    // Render's health check stays public; /status and every data route are protected.
    if (req.method === 'GET' && req.path === '/') return next();

    if (!tokenConfigured) {
      return res.status(503).json({ error: 'API authentication is not configured' });
    }

    const authorization = typeof req.get === 'function'
      ? req.get('authorization')
      : req.headers?.authorization;
    const match = /^Bearer\s+(\S+)$/i.exec(String(authorization || ''));
    if (!match) return res.status(401).json({ error: 'Unauthorized' });

    const supplied = Buffer.from(match[1], 'utf8');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    return next();
  };
}

module.exports = { createApiAuthMiddleware, MIN_TOKEN_BYTES };
