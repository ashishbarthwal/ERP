import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { requestLoggingMiddleware } from '../src/middleware/request-logging.middleware';

test('request logging assigns its own id and omits query strings and request data', () => {
  let finish: (() => void) | undefined;
  let requestIdHeader = '';
  let logLine = '';
  let nextCalled = false;
  const originalLog = console.log;
  console.log = (message?: unknown) => { logLine = String(message); };
  try {
    const req = {
      method: 'POST', path: '/api/auth/login', url: '/api/auth/login?password=private',
      baseUrl: '/api/auth', route: { path: '/login' },
    } as Request;
    const res = {
      locals: {}, statusCode: 401,
      setHeader: (name: string, value: string) => { if (name === 'X-Request-Id') requestIdHeader = value; },
      once: (_event: string, listener: () => void) => { finish = listener; },
    } as unknown as Response;

    requestLoggingMiddleware(req, res, (() => { nextCalled = true; }) as NextFunction);
    assert.equal(nextCalled, true);
    assert.match(requestIdHeader, /^[0-9a-f-]{36}$/i);
    assert.equal((res.locals as { requestId: string }).requestId, requestIdHeader);
    finish?.();
  } finally {
    console.log = originalLog;
  }

  const log = JSON.parse(logLine);
  assert.deepEqual(log, {
    level: 'warn', event: 'http_request', requestId: requestIdHeader,
    method: 'POST', route: '/api/auth/login', statusCode: 401, durationMs: log.durationMs,
  });
  assert.equal(logLine.includes('private'), false);
});
