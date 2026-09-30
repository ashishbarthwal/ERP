const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const RESTORE_DATABASE = 'erp_restore_test';

function parseTestDatabase(raw) {
  if (!raw) throw new Error('ERP_TEST_DATABASE_URL is required.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('ERP_TEST_DATABASE_URL is not a valid URL.'); }
  if (url.protocol !== 'postgresql:' || url.username !== 'erp' || !url.password ||
      url.hostname !== 'localhost' || url.port !== '5432' || url.pathname !== '/erp_test' ||
      url.searchParams.get('schema') !== 'public' || [...url.searchParams.keys()].some((key) => key !== 'schema')) {
    throw new Error('Refusing database target. The backup drill only accepts the disposable local erp_test PostgreSQL database.');
  }
  url.search = '';
  url.hash = '';
  const source = url.toString();
  const maintenance = new URL(source);
  maintenance.pathname = '/postgres';
  const restore = new URL(source);
  restore.pathname = `/${RESTORE_DATABASE}`;
  return { source, maintenance: maintenance.toString(), restore: restore.toString() };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, ...options });
  if (result.error) throw new Error(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} failed (exit ${result.status}). ${result.stderr || ''}`.trim());
  return result.stdout;
}

function fingerprint(connection) {
  const sql = `SELECT json_build_object(
    'users', (SELECT count(*) FROM "User"),
    'auditEvents', (SELECT count(*) FROM "AuditEvent"),
    'customers', (SELECT count(*) FROM "Customer"),
    'products', (SELECT count(*) FROM "Product"),
    'inventory', (SELECT count(*) FROM "InventoryItem"),
    'inventoryMovements', (SELECT count(*) FROM "InventoryMovement"),
    'purchaseOrders', (SELECT count(*) FROM "PurchaseOrder"),
    'orders', (SELECT count(*) FROM "Order"),
    'invoices', (SELECT count(*) FROM "Invoice"),
    'payments', (SELECT count(*) FROM "Payment"),
    'paymentCents', (SELECT coalesce(sum("amountCents"), 0) FROM "Payment"),
    'accountActionTokens', (SELECT count(*) FROM "AccountActionToken"),
    'rateLimitBuckets', (SELECT count(*) FROM "RateLimitBucket"),
    'migrations', (SELECT count(*) FROM "_prisma_migrations")
  )::text;`;
  return run('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', connection, '-c', sql]).trim();
}

function main() {
  let targets;
  try { targets = parseTestDatabase(process.env.ERP_TEST_DATABASE_URL); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; return; }

  const work = mkdtempSync(join(tmpdir(), 'mini-erp-backup-'));
  const dump = join(work, 'erp_test.dump');
  try {
    const before = fingerprint(targets.source);
    run('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', dump, targets.source]);
    run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', targets.maintenance, '-c', `DROP DATABASE IF EXISTS "${RESTORE_DATABASE}" WITH (FORCE);`]);
    run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', targets.maintenance, '-c', `CREATE DATABASE "${RESTORE_DATABASE}";`]);
    run('pg_restore', ['--exit-on-error', '--no-owner', '--no-acl', '--dbname', targets.restore, dump]);
    const after = fingerprint(targets.restore);
    if (before !== after) throw new Error('Backup restore verification failed: restored data fingerprint does not match source.');
    const digest = createHash('sha256').update(before).digest('hex').slice(0, 12);
    process.stdout.write(`PostgreSQL backup/restore smoke passed (data fingerprint ${digest}).\n`);
  } finally {
    try { run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', targets.maintenance, '-c', `DROP DATABASE IF EXISTS "${RESTORE_DATABASE}" WITH (FORCE);`]); }
    finally { rmSync(work, { recursive: true, force: true }); }
  }
}

if (require.main === module) main();
module.exports = { parseTestDatabase };
