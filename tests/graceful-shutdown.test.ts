import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';
import { createShutdownHandler } from '../src/lib/graceful-shutdown';

test('graceful shutdown stops once, disconnects the database, and records completion', async () => {
  let closes = 0;
  let disconnects = 0;
  const events: object[] = [];
  const server = {
    close(callback: (error?: Error) => void) { closes += 1; callback(); return this; },
    closeAllConnections() { throw new Error('force close should not run'); },
  } as unknown as Server;
  const shutdown = createShutdownHandler({ server, disconnect: async () => { disconnects += 1; }, log: event => events.push(event) });
  const first = shutdown('SIGTERM');
  const second = shutdown('SIGINT');
  assert.equal(first, second);
  await first;
  assert.equal(closes, 1);
  assert.equal(disconnects, 1);
  assert.deepEqual(events, [
    { level: 'info', event: 'shutdown_started', signal: 'SIGTERM' },
    { level: 'info', event: 'shutdown_completed', signal: 'SIGTERM' },
  ]);
});

test('graceful shutdown force-closes connections after the deadline', async () => {
  let forced = 0;
  let disconnects = 0;
  const server = {
    close() { return this; },
    closeAllConnections() { forced += 1; },
  } as unknown as Server;
  const shutdown = createShutdownHandler({ server, disconnect: async () => { disconnects += 1; }, timeoutMs: 5, log: () => {} });
  await assert.rejects(() => shutdown('SIGTERM'), /timed out/);
  assert.equal(forced, 1);
  assert.equal(disconnects, 1);
});
