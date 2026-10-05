const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { deploymentOrigin, verifyDeployment } = require('./verify-deployment.cjs');

const sha = 'a'.repeat(40);

test('accepts only a clean HTTPS origin outside explicit local tests', () => {
  assert.equal(deploymentOrigin('https://erp.example.test'), 'https://erp.example.test');
  assert.throws(() => deploymentOrigin('http://erp.example.test'), /requires HTTPS/);
  assert.throws(() => deploymentOrigin('https://user:secret@erp.example.test'), /without credentials/);
  assert.throws(() => deploymentOrigin('https://erp.example.test/login'), /must be an origin/);
});

test('verifies release identity, readiness, security headers, and secure CSRF cookie', async () => {
  const server = createServer((request, response) => {
    response.setHeader('X-ERP-Release', sha);
    response.setHeader('Strict-Transport-Security', 'max-age=31536000');
    response.setHeader('Content-Security-Policy', "default-src 'self'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Set-Cookie', 'erp_csrf=test; Path=/; Secure; SameSite=Lax');
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ status: request.url === '/ready' ? 'ready' : 'ok' }));
  }).listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const result = await verifyDeployment({ origin: `http://127.0.0.1:${address.port}`, expectedSha: sha, allowLocalHttp: true });
    assert.deepEqual(result, { origin: `http://127.0.0.1:${address.port}`, releaseSha: sha, health: 'ok', readiness: 'ready' });
    await assert.rejects(() => verifyDeployment({ origin: `http://127.0.0.1:${address.port}`, expectedSha: 'b'.repeat(40), allowLocalHttp: true }), /x-erp-release/);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
