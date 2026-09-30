import 'dotenv/config';
import { createApp } from './app';
import { parseRuntimeConfig } from './config/runtime-config';
import { configureAuthAttemptLimits } from './middleware/ip-rate-limit';
import { prisma } from './lib/prisma';
import { createShutdownHandler } from './lib/graceful-shutdown';

const config = parseRuntimeConfig(process.env);
configureAuthAttemptLimits(config.authLoginAttemptLimit, config.authSignupAttemptLimit);
const app = createApp(config.trustProxyHops, config.releaseSha);

const server = app.listen(config.port, () => {
  console.log(`mini-erp API listening on http://localhost:${config.port}`);
});

const shutdown = createShutdownHandler({ server, disconnect: () => prisma.$disconnect() });
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => {
  void shutdown(signal).catch(error => {
    process.stderr.write(`${JSON.stringify({ level: 'error', event: 'shutdown_failed', signal,
      errorName: error instanceof Error ? error.name : typeof error })}\n`);
    process.exitCode = 1;
  });
});
