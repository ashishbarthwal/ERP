import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { AppError } from '../src/lib/errors';
import { sendAccountActionEmail, validateMailConfiguration } from '../src/lib/account-email';
import { parseRuntimeConfig } from '../src/config/runtime-config';
import { signupUser, requestPasswordReset, resendEmailVerification, verifyAccountEmail, resetPassword } from '../src/modules/auth/auth.service';

const setDemoEnvironment = (t: { after: (callback: () => void) => void }) => {
  const values = { NODE_ENV: 'staging', MAIL_MODE: 'disabled', JWT_SECRET: 'test-only-demo-secret-at-least-32-characters' };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
};

test('email-free staging still requires secure deployment identity and database configuration; production rejects it', () => {
  const environment = { NODE_ENV: 'staging', MAIL_MODE: 'disabled', APP_RELEASE_SHA: 'a'.repeat(40),
    DATABASE_URL: 'postgresql://app:secret@db.example.test/erp',
    DATABASE_URL_UNPOOLED: 'postgresql://app:secret@db.example.test/erp', JWT_SECRET: 'x'.repeat(48) };
  assert.deepEqual(validateMailConfiguration(environment), { mode: 'disabled' });
  assert.equal(parseRuntimeConfig(environment).releaseSha, environment.APP_RELEASE_SHA);
  assert.throws(() => parseRuntimeConfig({ ...environment, JWT_SECRET: 'short' }), /at least 32/);
  assert.throws(() => parseRuntimeConfig({ ...environment, APP_RELEASE_SHA: '' }), /APP_RELEASE_SHA must be set/);
  assert.throws(() => parseRuntimeConfig({ ...environment, NODE_ENV: 'production' }), /only for the staging demo/);
  assert.throws(() => parseRuntimeConfig({ ...environment, MAIL_MODE: 'anything' }), /MAIL_MODE must/);
});

test('disabled email rejects account operations and delivery before any database access or token generation', async (t) => {
  setDemoEnvironment(t);
  let databaseCalls = 0;
  const mocks: Array<[object, string]> = [[prisma.user, 'findUnique'], [prisma.user, 'create'],
    [prisma.accountActionToken, 'findUnique'], [prisma, '$transaction']];
  for (const [delegate, name] of mocks) {
    const previous = Object.getOwnPropertyDescriptor(delegate, name);
    Object.defineProperty(delegate, name, { configurable: true, value: () => {
      databaseCalls++; throw new Error('Unexpected database access');
    } });
    t.after(() => {
      if (previous) Object.defineProperty(delegate, name, previous);
      else delete (delegate as Record<string, unknown>)[name];
    });
  }
  const unavailable = (error: unknown) => error instanceof AppError && error.statusCode === 503;
  await assert.rejects(signupUser({ name: 'Test', email: 'test@example.test',
    password: 'test-only-password-123', confirmPassword: 'test-only-password-123' }), unavailable);
  await assert.rejects(requestPasswordReset('test@example.test'), unavailable);
  await assert.rejects(resendEmailVerification('test@example.test'), unavailable);
  await assert.rejects(verifyAccountEmail('a'.repeat(43)), unavailable);
  await assert.rejects(resetPassword('a'.repeat(43), 'test-only-password-123'), unavailable);
  await assert.rejects(sendAccountActionEmail({ to: 'test@example.test', name: 'Test',
    purpose: 'PASSWORD_RESET', rawToken: 'a'.repeat(43) }), unavailable);
  assert.equal(databaseCalls, 0);
});

test('demo keeps secure sign-in available and rejects GET and CSRF-valid POST email routes', async (t) => {
  setDemoEnvironment(t);
  const server = createApp().listen(0);
  t.after(() => { server.close(); });
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const login = await fetch(`${base}/login`);
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie') || '', /Secure/);
  const html = await login.text();
  assert.match(html, /action="\/login"/);
  assert.doesNotMatch(html, /href="\/(signup|forgot-password)/);
  const token = /name="_csrf" value="([a-f0-9]+)"/.exec(html)?.[1];
  const cookie = /erp_csrf=[a-f0-9]+/.exec(login.headers.get('set-cookie') || '')?.[0];
  assert.ok(token && cookie);
  for (const route of ['/SIGNUP', '/signup/', '/Forgot-Password/']) {
    assert.equal((await fetch(`${base}${route}`)).status, 503);
  }
  for (const route of ['/signup', '/signup/success', '/verify-email', '/verify-email/resend', '/forgot-password', '/reset-password']) {
    assert.equal((await fetch(`${base}${route}`)).status, 503);
    const response = await fetch(`${base}${route}`, { method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: token, email: 'test@example.test' }) });
    assert.equal(response.status, 503);
    assert.match(await response.text(), /unavailable in this demo/);
  }
});
