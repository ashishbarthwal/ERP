import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';
import { ZodError } from 'zod';

export const unexpectedErrorEvent = (err: unknown, req: Request, res: Response) => {
  const candidate = err && typeof err === 'object' ? err as { name?: unknown; code?: unknown } : undefined;
  const databaseCode = typeof candidate?.code === 'string' && /^P\d{4}$/.test(candidate.code) ? candidate.code : undefined;
  return {
    level: 'error',
    event: 'application_error',
    requestId: res.locals.requestId,
    method: req.method,
    route: req.route ? `${req.baseUrl}${req.route.path}` : req.path,
    errorName: typeof candidate?.name === 'string' ? candidate.name : typeof err,
    ...(databaseCode ? { databaseCode } : {}),
  };
};

const logUnexpectedError = (err: unknown, req: Request, res: Response) => {
  console.error(JSON.stringify(unexpectedErrorEvent(err, req, res)));
};

// Centralized error handler: keeps route handlers free of try/catch boilerplate
// (routes call next(err) or throw inside asyncHandler-wrapped handlers).
export const errorMiddleware = (err: unknown, req: Request, res: Response, next: NextFunction) => {
  const expected = err instanceof AppError || err instanceof ZodError
    || (err instanceof Error && ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(err.name));
  if (!expected) logUnexpectedError(err, req, res);
  if (res.headersSent) return next(err);
  const webRequest = !req.path.startsWith('/api/') && req.path !== '/api' && !['/health', '/ready'].includes(req.path);
  if (webRequest) {
    const status = err instanceof AppError ? err.statusCode : err instanceof ZodError ? 400 : 500;
    const denied = status === 401 || status === 403;
    return res.status(status).render('system-error', {
      pageTitle: denied ? 'Access restricted' : status === 404 ? 'Page not found' : 'Request error',
      errorCode: String(status),
      errorTitle: denied ? 'Access restricted' : status === 404 ? 'Page not found' : status >= 500 ? 'Something went wrong' : 'Unable to complete request',
      errorDescription: denied ? 'Your account cannot open this page or complete this action.' : status === 404 ? 'This page may have moved, or the address may be incorrect.' : status >= 500 ? 'Please try again. If the problem continues, contact your workspace administrator.' : 'Review your request and try again.',
      requestId: status >= 500 ? res.locals.requestId : undefined,
      error: '',
    });
  }
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      issues: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }

  if (err instanceof Error && ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(err.name)) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  return res.status(500).json({ error: 'Internal server error', requestId: res.locals.requestId });
};

// Wraps an async route handler so thrown/rejected errors reach errorMiddleware.
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
