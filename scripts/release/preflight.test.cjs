const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { validateReleaseArtifact } = require('./preflight.cjs');

const root = path.join(__dirname, '..', '..');
const sha = 'a'.repeat(40);
const valid = {
  expectedSha: sha,
  configuredSha: sha,
  serverPath: path.join(root, 'dist', 'server.js'),
  migrationsPath: path.join(root, 'prisma', 'migrations'),
};

test('accepts a compiled release whose configured identity matches', () => {
  assert.doesNotThrow(() => validateReleaseArtifact(valid));
});

test('rejects ambiguous identity and incomplete release artifacts', () => {
  assert.throws(() => validateReleaseArtifact({ ...valid, expectedSha: 'abc123' }), /full 40-character/);
  assert.throws(() => validateReleaseArtifact({ ...valid, configuredSha: 'b'.repeat(40) }), /does not match/);
  assert.throws(() => validateReleaseArtifact({ ...valid, serverPath: path.join(root, 'dist', 'missing.js') }), /artifact is missing/);
  assert.throws(() => validateReleaseArtifact({ ...valid, migrationsPath: path.join(root, 'prisma', 'missing') }), /history is missing/);
});
