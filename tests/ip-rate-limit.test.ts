import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { IpRateLimiter, rateLimitMiddleware } from '../src/middleware/ip-rate-limit';

test('IP limits count attempts, separate clients, and reset after the window', () => {
  let now = 10_000;
  const limiter = new IpRateLimiter(2, 60_000, () => now);

  assert.equal(limiter.consume('192.0.2.1').allowed, true);
  assert.equal(limiter.consume('192.0.2.1').remaining, 0);
  assert.equal(limiter.consume('192.0.2.1').allowed, false);
  assert.equal(limiter.consume('192.0.2.2').allowed, true);
  now += 60_001;
  assert.equal(limiter.consume('192.0.2.1').allowed, true);
});

test('rate limit middleware returns 429, retry timing, and rate limit headers', async (t) => {
  const app = express();
  const limiter = new IpRateLimiter(1, 60_000);
  app.post('/login', rateLimitMiddleware(limiter), (_req, res) => res.sendStatus(204));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/login`;

  assert.equal((await fetch(url, { method: 'POST' })).status, 204);
  const blocked = await fetch(url, { method: 'POST' });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal(blocked.headers.get('ratelimit-limit'), '1');
  assert.equal(blocked.headers.get('ratelimit-remaining'), '0');
  assert.match((await blocked.json() as { error: string }).error, /Too many attempts/);
});
