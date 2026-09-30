const { spawn } = require('node:child_process');
const path = require('node:path');

const mode = process.argv[2];
if (!['dev', 'start'].includes(mode)) {
  process.stderr.write('Usage: node scripts/run-app.cjs <dev|start>\n');
  process.exit(2);
}

if (!process.env.NODE_ENV) process.env.NODE_ENV = mode === 'dev' ? 'development' : 'production';
if (mode === 'dev' && !['development', 'test'].includes(process.env.NODE_ENV)) {
  process.stderr.write('The dev command requires NODE_ENV=development or test.\n');
  process.exit(2);
}

const command = mode === 'dev'
  ? [path.join(__dirname, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'watch', 'src/server.ts']
  : [path.join(__dirname, '..', 'dist', 'server.js')];
const child = spawn(process.execPath, command, { cwd: path.join(__dirname, '..'), env: process.env, stdio: 'inherit' });
child.on('error', error => {
  process.stderr.write(`Could not start ERP ${mode} process: ${error.message}\n`);
  process.exitCode = 1;
});
child.on('close', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
