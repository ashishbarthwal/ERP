import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app';

test('public account recovery and verification pages render with secure form fields', async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-account-pages-secret-which-is-long-enough';
  const server = createApp().listen(0);
  t.after(() => {
    server.close();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;

  const login = await fetch(`${base}/login`);
  assert.equal(login.status, 200);
  assert.match(await login.text(), /Forgot your password\?/);

  const forgot = await fetch(`${base}/forgot-password`);
  assert.equal(forgot.status, 200);
  assert.match(await forgot.text(), /Send recovery link/);

  const reset = await fetch(`${base}/reset-password?token=${'a'.repeat(43)}`);
  const resetHtml = await reset.text();
  assert.equal(reset.status, 200);
  assert.match(resetHtml, /name="_csrf"/);
  assert.match(resetHtml, /name="confirmPassword"/);
  assert.match(resetHtml, /name="token" value="a{43}"/);

  const verify = await fetch(`${base}/verify-email?token=${'b'.repeat(43)}`);
  const verifyHtml = await verify.text();
  assert.equal(verify.status, 200);
  assert.match(verifyHtml, /Confirm email address/);
  assert.match(verifyHtml, /name="_csrf"/);
});
