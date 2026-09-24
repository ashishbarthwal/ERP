import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';
import { ZodError } from 'zod';

// Centralized error handler: keeps route handlers free of try/catch boilerplate
// (routes call next(err) or throw inside asyncHandler-wrapped handlers).
export const errorMiddleware = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      issues: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }

  if (err instanceof Error && err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }

  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
};

// Wraps an async route handler so thrown/rejected errors reach errorMiddleware.
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
