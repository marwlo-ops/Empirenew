'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createApiAuthMiddleware, MIN_TOKEN_BYTES } = require('./api-auth-middleware');

const TOKEN = '0123456789abcdef0123456789abcdef';

function invoke(token, options = {}) {
  const middleware = createApiAuthMiddleware({ token });
  const req = {
    method: options.method || 'GET',
    path: options.path || '/status',
    headers: options.authorization ? { authorization: options.authorization } : {},
    get(name) { return this.headers[name.toLowerCase()]; }
  };
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    sendStatus(code) { this.statusCode = code; return this; }
  };
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

test('requires a token of at least 32 bytes', () => {
  assert.equal(MIN_TOKEN_BYTES, 32);
  assert.equal(invoke('short').res.statusCode, 503);
});

test('keeps only GET / public for hosting health checks', () => {
  assert.equal(invoke('', { path: '/' }).nextCalled, true);
  assert.equal(invoke('', { path: '/status' }).res.statusCode, 503);
});

test('allows CORS preflight without exposing route data', () => {
  const result = invoke('', { method: 'OPTIONS', path: '/status' });
  assert.equal(result.res.statusCode, 204);
  assert.equal(result.nextCalled, false);
});

test('rejects missing and invalid bearer tokens', () => {
  assert.equal(invoke(TOKEN).res.statusCode, 401);
  assert.equal(invoke(TOKEN, { authorization: 'Bearer wrong' }).res.statusCode, 401);
  assert.equal(invoke(TOKEN, { authorization: 'Basic ' + TOKEN }).res.statusCode, 401);
});

test('accepts the configured bearer token and continues', () => {
  const result = invoke(TOKEN, { authorization: 'Bearer ' + TOKEN });
  assert.equal(result.res.statusCode, 200);
  assert.equal(result.nextCalled, true);
});

test('treats /status as protected and does not echo secrets in errors', () => {
  const result = invoke(TOKEN, { path: '/status' });
  assert.equal(result.res.statusCode, 401);
  assert.equal(JSON.stringify(result.res.body).includes(TOKEN), false);
});
