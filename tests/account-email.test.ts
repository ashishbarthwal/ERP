import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { sendAccountActionEmail, validateMailConfiguration } from '../src/lib/account-email';

const productionMail = {
  NODE_ENV: 'production', MAIL_HOST: 'smtp.example.test', MAIL_PORT: '587',
  MAIL_USER: 'erp@example.test', MAIL_PASSWORD: 'secret', MAIL_FROM: 'erp@example.test',
  PUBLIC_APP_URL: 'https://erp.example.test',
};

test('local development and isolated tests use console delivery without SMTP', () => {
  assert.deepEqual(validateMailConfiguration({ NODE_ENV: 'development' }), { mode: 'console' });
  assert.deepEqual(validateMailConfiguration({ NODE_ENV: 'test' }), { mode: 'console' });
});

test('deployed mail requires complete SMTP settings and a public HTTPS URL', () => {
  assert.throws(() => validateMailConfiguration({ NODE_ENV: 'production' }), /Set all mail settings together/);
  assert.throws(() => validateMailConfiguration({ NODE_ENV: 'staging' }), /Set all mail settings together/);
  assert.throws(() => validateMailConfiguration({ ...productionMail, PUBLIC_APP_URL: 'http://erp.example.test' }), /must use HTTPS/);
  assert.throws(() => validateMailConfiguration({ ...productionMail, MAIL_PORT: 'smtp' }), /MAIL_PORT/);
  assert.deepEqual(validateMailConfiguration(productionMail), {
    mode: 'smtp', host: 'smtp.example.test', port: 587, user: 'erp@example.test', password: 'secret',
    from: 'erp@example.test', secure: false, appUrl: 'https://erp.example.test',
  });
  assert.equal(validateMailConfiguration({ ...productionMail, NODE_ENV: 'staging' }).mode, 'smtp');
});

test('test mail capture writes one-use links only to the configured isolated outbox', async (t) => {
  const previous = { nodeEnv: process.env.NODE_ENV, outbox: process.env.ERP_TEST_EMAIL_OUTBOX, appUrl: process.env.PUBLIC_APP_URL };
  const directory = mkdtempSync(join(tmpdir(), 'mini-erp-mail-test-'));
  const outbox = join(directory, 'outbox.jsonl');
  process.env.NODE_ENV = 'test';
  process.env.ERP_TEST_EMAIL_OUTBOX = outbox;
  process.env.PUBLIC_APP_URL = 'http://127.0.0.1:4000';
  t.after(() => {
    for (const [key, value] of [['NODE_ENV', previous.nodeEnv], ['ERP_TEST_EMAIL_OUTBOX', previous.outbox], ['PUBLIC_APP_URL', previous.appUrl]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(directory, { recursive: true, force: true });
  });
  await sendAccountActionEmail({ to: 'test@example.test', name: 'Test User', purpose: 'PASSWORD_RESET', rawToken: 'a'.repeat(43) });
  const [entry] = readFileSync(outbox, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(entry.to, 'test@example.test');
  assert.equal(entry.purpose, 'PASSWORD_RESET');
  assert.equal(new URL(entry.url).pathname, '/reset-password');
  assert.equal(new URL(entry.url).searchParams.get('token'), 'a'.repeat(43));
});
