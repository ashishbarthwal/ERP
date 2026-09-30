import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app';

test('staging sends HSTS and Secure CSRF cookies', async () => {
  const previous = { nodeEnv: process.env.NODE_ENV, jwtSecret: process.env.JWT_SECRET };
  process.env.NODE_ENV = 'staging';
  process.env.JWT_SECRET = 'stage-secret-for-cookie-policy-tests';
  const server = createApp().listen(0, '127.0.0.1');
  try {
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const response = await fetch(`http://127.0.0.1:${address.port}/login`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
    assert.match(response.headers.get('set-cookie') ?? '', /erp_csrf=[^;]+;[^\r\n]*Secure/i);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.jwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous.jwtSecret;
  }
});
