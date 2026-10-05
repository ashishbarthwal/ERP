import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const requestLoggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = randomUUID();
  const startedAt = Date.now();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.once('finish', () => {
    const statusCode = res.statusCode;
    const route = req.route ? `${req.baseUrl}${req.route.path}` : req.path;
    console.log(JSON.stringify({
      level: statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info',
      event: 'http_request',
      requestId,
      method: req.method,
      route,
      statusCode,
      durationMs: Date.now() - startedAt,
    }));
  });

  next();
};
