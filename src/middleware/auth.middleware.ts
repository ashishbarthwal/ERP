import type { NextFunction, Request, Response } from 'express';
import { verifyToken, type AuthTokenPayload } from '../lib/jwt';
import { forbidden, unauthorized } from '../lib/errors';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw unauthorized('Missing bearer token');
  }

  const token = header.slice('Bearer '.length);
  req.user = verifyToken(token);
  next();
};

export const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN') {
    throw forbidden('Admin role required');
  }
  next();
};
