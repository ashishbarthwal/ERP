import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCorsOrigins, parseRuntimeConfig } from '../src/config/runtime-config';

const valid = {
  DATABASE_URL: 'postgresql://app:secret@db.example.test/erp',
  DATABASE_URL_UNPOOLED: 'postgresql://app:secret@db.example.test/erp',
  JWT_SECRET: 'a'.repeat(48),
};

test('runtime config validates the database, secret, CORS origins, and port', () => {
  assert.deepEqual(parseRuntimeConfig(valid), {
    port: 4000, trustProxyHops: 0, authLoginAttemptLimit: 10, authSignupAttemptLimit: 5,
    production: false, corsOrigins: new Set(),
  });
  assert.deepEqual(parseCorsOrigins('https://app.example.test,http://localhost:3000'), [
    'https://app.example.test', 'http://localhost:3000',
  ]);
  assert.throws(() => parseRuntimeConfig({ ...valid, JWT_SECRET: 'short' }), /at least 32/);
  assert.throws(() => parseRuntimeConfig({ ...valid, DATABASE_URL: 'file:./dev.db' }), /PostgreSQL URL/);
  assert.throws(() => parseRuntimeConfig({ ...valid, PORT: '4000/api' }), /integer between/);
  assert.equal(parseRuntimeConfig({ ...valid, TRUST_PROXY_HOPS: '1' }).trustProxyHops, 1);
  assert.throws(() => parseRuntimeConfig({ ...valid, TRUST_PROXY_HOPS: 'true' }), /TRUST_PROXY_HOPS/);
  assert.deepEqual(parseRuntimeConfig({ ...valid, AUTH_LOGIN_ATTEMPT_LIMIT: '250', AUTH_SIGNUP_ATTEMPT_LIMIT: '250' }), {
    port: 4000, trustProxyHops: 0, authLoginAttemptLimit: 250, authSignupAttemptLimit: 250,
    production: false, corsOrigins: new Set(),
  });
  assert.throws(() => parseRuntimeConfig({ ...valid, AUTH_LOGIN_ATTEMPT_LIMIT: '0' }), /AUTH_LOGIN_ATTEMPT_LIMIT/);
  assert.throws(() => parseCorsOrigins('https://app.example.test/path'), /exact HTTP or HTTPS origins/);
  assert.equal(parseRuntimeConfig({ ...valid, NODE_ENV: 'production' }).production, true);
});
