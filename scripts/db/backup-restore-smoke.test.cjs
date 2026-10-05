const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTestDatabase } = require('./backup-restore-smoke.cjs');

const safe = 'postgresql://erp:disposable@localhost:5432/erp_test?schema=public';

test('accepts only the disposable local CI database and derives fixed restore target', () => {
  const targets = parseTestDatabase(safe);
  assert.equal(new URL(targets.source).pathname, '/erp_test');
  assert.equal(new URL(targets.restore).pathname, '/erp_restore_test');
  assert.equal(new URL(targets.maintenance).pathname, '/postgres');
  for (const url of Object.values(targets)) assert.equal(new URL(url).search, '');
});

test('refuses hosted, unexpected, and non-PostgreSQL targets before running tools', () => {
  for (const target of [
    'postgresql://erp:secret@db.example.com:5432/erp_test?schema=public',
    'postgresql://erp:secret@localhost:5432/neondb?schema=public',
    'postgresql://erp:secret@localhost:5432/erp_test?schema=public&sslmode=require',
    'mysql://erp:secret@localhost:5432/erp_test?schema=public',
  ]) assert.throws(() => parseTestDatabase(target), /Refusing database target/);
  assert.throws(() => parseTestDatabase(undefined), /required/);
});
