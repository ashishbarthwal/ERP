const { existsSync, readdirSync } = require('node:fs');
const path = require('node:path');

const fullSha = /^[a-f0-9]{40}$/i;

const validateReleaseArtifact = ({ expectedSha, configuredSha, serverPath, migrationsPath }) => {
  if (!fullSha.test(expectedSha || '')) throw new Error('Expected release must be a full 40-character Git commit SHA');
  if (configuredSha !== expectedSha) throw new Error('APP_RELEASE_SHA does not match the release being deployed');
  if (!existsSync(serverPath)) throw new Error('Compiled server artifact is missing; run npm run build first');
  if (!existsSync(migrationsPath) || !readdirSync(migrationsPath, { withFileTypes: true }).some(entry => entry.isDirectory())) {
    throw new Error('Prisma migration history is missing from the release artifact');
  }
};

const run = () => {
  const expectedSha = process.argv[2];
  const root = path.join(__dirname, '..', '..');
  const { parseRuntimeConfig } = require(path.join(root, 'dist', 'config', 'runtime-config.js'));
  const config = parseRuntimeConfig(process.env);
  validateReleaseArtifact({
    expectedSha,
    configuredSha: config.releaseSha,
    serverPath: path.join(root, 'dist', 'server.js'),
    migrationsPath: path.join(root, 'prisma', 'migrations'),
  });
  process.stdout.write(`Release preflight passed for ${expectedSha}\n`);
};

if (require.main === module) {
  try { run(); }
  catch (error) {
    process.stderr.write(`Release preflight failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    process.exitCode = 1;
  }
}

module.exports = { validateReleaseArtifact };
