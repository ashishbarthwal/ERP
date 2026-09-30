const fullSha = /^[a-f0-9]{40}$/i;

const deploymentOrigin = (rawOrigin, allowLocalHttp = false) => {
  let url;
  try { url = new URL(rawOrigin); }
  catch { throw new Error('Deployment target must be an absolute URL'); }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('Deployment target must be an origin without credentials, path, query, or fragment');
  }
  const localHttp = allowLocalHttp && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) throw new Error('Deployment verification requires HTTPS');
  return url.origin;
};

const expectHeader = (response, name, expected) => {
  const value = response.headers.get(name) || '';
  if (expected instanceof RegExp ? !expected.test(value) : value !== expected) {
    throw new Error(`${response.url || 'response'} has an invalid ${name} header`);
  }
};

const verifyDeployment = async ({ origin, expectedSha, allowLocalHttp = false, fetchImpl = fetch }) => {
  const target = deploymentOrigin(origin, allowLocalHttp);
  if (!fullSha.test(expectedSha || '')) throw new Error('Expected release must be a full 40-character Git commit SHA');
  const request = async (pathname) => {
    const response = await fetchImpl(new URL(pathname, target), { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    if (response.status !== 200) throw new Error(`${pathname} returned HTTP ${response.status}`);
    expectHeader(response, 'x-erp-release', expectedSha);
    return response;
  };

  const [health, ready, login] = await Promise.all([request('/health'), request('/ready'), request('/login')]);
  if ((await health.json()).status !== 'ok') throw new Error('/health did not report ok');
  if ((await ready.json()).status !== 'ready') throw new Error('/ready did not report ready');
  expectHeader(login, 'strict-transport-security', /^max-age=\d+/);
  expectHeader(login, 'content-security-policy', /default-src 'self'/);
  expectHeader(login, 'x-content-type-options', 'nosniff');
  expectHeader(login, 'x-frame-options', 'DENY');
  expectHeader(login, 'referrer-policy', 'same-origin');
  expectHeader(login, 'cache-control', 'no-store');
  expectHeader(login, 'set-cookie', /erp_csrf=[^;]+;[^\r\n]*Secure/i);
  return { origin: target, releaseSha: expectedSha, health: 'ok', readiness: 'ready' };
};

const run = async () => {
  const [origin, expectedSha] = process.argv.slice(2);
  const result = await verifyDeployment({ origin, expectedSha });
  process.stdout.write(`Deployment verification passed for ${result.releaseSha} at ${result.origin}\n`);
};

if (require.main === module) run().catch(error => {
  process.stderr.write(`Deployment verification failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
});

module.exports = { deploymentOrigin, verifyDeployment };
