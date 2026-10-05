const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveRenderEnvironment } = require('./render-environment.cjs');
const { parseRuntimeConfig } = require('../../dist/config/runtime-config.js');
const { validateMailConfiguration } = require('../../dist/lib/account-email.js');

const hosted = {
  NODE_ENV: 'staging', RENDER: 'true',
  RENDER_EXTERNAL_URL: 'https://ledgernest-demo.onrender.com', RENDER_GIT_COMMIT: 'a'.repeat(40),
  DATABASE_URL: 'postgresql://app:secret@db.example.test/erp',
  DATABASE_URL_UNPOOLED: 'postgresql://app:secret@db.example.test/erp',
  JWT_SECRET: 'x'.repeat(48), MAIL_HOST: 'smtp.example.test', MAIL_PORT: '2525',
  MAIL_USER: 'smtp-login', MAIL_PASSWORD: 'test-only-mail-key', MAIL_FROM: 'sender@example.test',
};

test('Render defaults supply the real email-link origin and exact deployed identity at startup', () => {
  const resolved = resolveRenderEnvironment(hosted);
  assert.equal(parseRuntimeConfig(resolved).releaseSha, hosted.RENDER_GIT_COMMIT);
  assert.equal(validateMailConfiguration(resolved).appUrl, hosted.RENDER_EXTERNAL_URL);
  assert.equal(hosted.PUBLIC_APP_URL, undefined);
  assert.equal(hosted.APP_RELEASE_SHA, undefined);
});

test('explicit application settings remain authoritative, including invalid overrides', () => {
  const resolved = resolveRenderEnvironment({ ...hosted,
    PUBLIC_APP_URL: 'https://custom.example.test', APP_RELEASE_SHA: 'b'.repeat(40) });
  assert.equal(parseRuntimeConfig(resolved).releaseSha, 'b'.repeat(40));
  assert.equal(validateMailConfiguration(resolved).appUrl, 'https://custom.example.test');
  assert.throws(() => parseRuntimeConfig(resolveRenderEnvironment({ ...hosted,
    PUBLIC_APP_URL: '<Render URL>' })), /absolute HTTPS URL/);
});

test('provider defaults are used only on Render and missing provider identity still fails closed', () => {
  assert.throws(() => parseRuntimeConfig(resolveRenderEnvironment({ ...hosted, RENDER: undefined })),
    /APP_RELEASE_SHA must be set/);
  assert.throws(() => parseRuntimeConfig(resolveRenderEnvironment({ ...hosted, RENDER_GIT_COMMIT: undefined })),
    /APP_RELEASE_SHA must be set/);
  assert.throws(() => parseRuntimeConfig(resolveRenderEnvironment({ ...hosted, RENDER_EXTERNAL_URL: undefined })),
    /absolute HTTPS URL/);
});
