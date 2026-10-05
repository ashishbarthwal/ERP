import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { IpRateLimiter, SharedIpRateLimiter, rateLimitMiddleware } from '../src/middleware/ip-rate-limit';
import { prisma } from '../src/lib/prisma';

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

test('shared IP limiters use the same private PostgreSQL key across instances', async (t) => {
  const priorSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-only-shared-rate-limit-secret';
  const bucketDelegate = prisma.rateLimitBucket as any;
  const originalDelete = Object.getOwnPropertyDescriptor(bucketDelegate, 'deleteMany');
  const originalQuery = Object.getOwnPropertyDescriptor(prisma, '$queryRaw');
  const counters = new Map<string, { count: number; resetAt: Date }>();
  const keys = new Set<string>();
  t.after(() => {
    if (originalDelete) Object.defineProperty(bucketDelegate, 'deleteMany', originalDelete);
    else delete bucketDelegate.deleteMany;
    if (originalQuery) Object.defineProperty(prisma, '$queryRaw', originalQuery);
    else delete (prisma as any).$queryRaw;
    if (priorSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = priorSecret;
  });
  bucketDelegate.deleteMany = async () => ({ count: 0 });
  (prisma as any).$queryRaw = async (_parts: TemplateStringsArray, key: string, resetAt: Date) => {
    keys.add(key);
    const current = counters.get(key);
    const bucket = !current || current.resetAt.getTime() <= 10_000
      ? { count: 1, resetAt }
      : { count: Math.min(current.count + 1, 3), resetAt: current.resetAt };
    counters.set(key, bucket);
    return [{ count: bucket.count, resetAt: bucket.resetAt }];
  };

  const firstInstance = new SharedIpRateLimiter(2, 60_000, 'login', () => 10_000);
  const secondInstance = new SharedIpRateLimiter(2, 60_000, 'login', () => 10_000);
  const first = await firstInstance.consume('203.0.113.8');
  const second = await secondInstance.consume('203.0.113.8');
  const blocked = await firstInstance.consume('203.0.113.8');
  assert.equal(first.allowed, true);
  assert.equal(second.remaining, 0);
  assert.equal(blocked.allowed, false);
  assert.equal(keys.size, 1);
  assert.doesNotMatch([...keys][0], /203\.0\.113\.8/);
  await new SharedIpRateLimiter(2, 60_000, 'signup', () => 10_000).consume('203.0.113.8');
  assert.equal(keys.size, 2);
});
