import type { Server } from 'node:http';

type ShutdownServer = Pick<Server, 'close' | 'closeAllConnections'>;

export const createShutdownHandler = ({
  server,
  disconnect,
  timeoutMs = 10_000,
  log = (event: object) => process.stdout.write(`${JSON.stringify(event)}\n`),
}: {
  server: ShutdownServer;
  disconnect: () => Promise<void>;
  timeoutMs?: number;
  log?: (event: object) => void;
}) => {
  let shutdown: Promise<void> | undefined;
  return (signal: string) => {
    if (shutdown) return shutdown;
    shutdown = new Promise<void>((resolve, reject) => {
      log({ level: 'info', event: 'shutdown_started', signal });
      let settled = false;
      const finish = async (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { await disconnect(); }
        catch { return reject(new Error('Database disconnect failed during shutdown')); }
        if (error) return reject(error);
        log({ level: 'info', event: 'shutdown_completed', signal });
        resolve();
      };
      const timer = setTimeout(() => {
        server.closeAllConnections();
        void finish(new Error(`Graceful shutdown timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref();
      server.close(error => void finish(error || undefined));
    });
    return shutdown;
  };
};
