require('dotenv').config();

const assert = require('node:assert/strict');

async function main() {
  const base = process.env.ERP_SMOKE_URL || 'http://localhost:4000';
  const password = process.env.ERP_DEMO_ADMIN_PASSWORD;
  if (!password) throw new Error('ERP_DEMO_ADMIN_PASSWORD is required for access smoke checks');

  const loginPage = await fetch(`${base}/login`);
  assert.equal(loginPage.status, 200, 'login page');
  assert.match(loginPage.headers.get('content-security-policy') || '', /default-src 'self'/, 'content security policy');
  assert.equal(loginPage.headers.get('x-frame-options'), 'DENY', 'frame protection');
  const nonceCookie = loginPage.headers.get('set-cookie')?.split(';')[0];
  const csrfToken = (await loginPage.text()).match(/name="_csrf" value="([a-f0-9]{64})"/)?.[1];
  assert.ok(nonceCookie && csrfToken, 'login form has CSRF token and cookie');

  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { cookie: nonceCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: csrfToken, email: 'admin@mini-erp.test', password }),
  });
  assert.equal(login.status, 302, 'admin login');
  const sessionCookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(sessionCookie?.startsWith('erp_session='), 'session cookie');
  const cookie = `${nonceCookie}; ${sessionCookie}`;

  const users = await fetch(`${base}/users`, { headers: { cookie } });
  assert.equal(users.status, 200, 'admin user directory');
  assert.match(await users.text(), /Workspace users/);
  for (const path of ['/dashboard', '/analytics', '/activity', '/customers', '/customers/new', '/products', '/products/new', '/orders', '/orders/new', '/invoices', '/suppliers', '/suppliers/new', '/purchase-orders', '/purchase-orders/new', '/register']) {
    const page = await fetch(`${base}${path}`, { headers: { cookie } });
    assert.equal(page.status, 200, `admin page ${path}`);
    const html = await page.text();
    if (html.includes('method="post"')) assert.match(html, /name="_csrf" value="[a-f0-9]{64}"/, `CSRF form ${path}`);
  }
  const missingCsrf = await fetch(`${base}/logout`, { method: 'POST', redirect: 'manual', headers: { cookie } });
  assert.equal(missingCsrf.status, 403, 'missing CSRF is rejected');
  const publicRegister = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(publicRegister.status, 401, 'public API registration is rejected');
  console.log('Access smoke passed: login, Admin pages, CSRF, public registration.');
}

main().catch((error) => {
  console.error(`Access smoke failed: ${error.message}`);
  process.exitCode = 1;
});
