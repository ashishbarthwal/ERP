import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';
import { unexpectedErrorEvent } from '../src/middleware/error.middleware';

test('unexpected error telemetry correlates safely without exception or request data', () => {
  const error = Object.assign(new Error('database password and customer email must stay private'), { code: 'P2002' });
  const request = { method: 'POST', path: '/api/orders', baseUrl: '/api', route: { path: '/orders' }, body: { password: 'secret' } } as unknown as Request;
  const response = { locals: { requestId: 'request-123' } } as unknown as Response;
  const event = unexpectedErrorEvent(error, request, response);
  assert.deepEqual(event, {
    level: 'error', event: 'application_error', requestId: 'request-123', method: 'POST',
    route: '/api/orders', errorName: 'Error', databaseCode: 'P2002',
  });
  const serialized = JSON.stringify(event);
  assert.doesNotMatch(serialized, /password|customer email|secret/);
});

test('unexpected error telemetry omits arbitrary error codes', () => {
  const request = { method: 'GET', path: '/ready' } as unknown as Request;
  const response = { locals: { requestId: 'request-456' } } as unknown as Response;
  const event = unexpectedErrorEvent({ name: 'RemoteError', code: 'customer-42' }, request, response);
  assert.equal(event.errorName, 'RemoteError');
  assert.equal('databaseCode' in event, false);
});
