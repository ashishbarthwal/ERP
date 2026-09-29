import type { NextFunction, Request, Response } from 'express';
import { verifyToken, type AuthTokenPayload } from '../lib/jwt';
import { forbidden, unauthorized } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { asRole, can, type Permission } from '../lib/permissions';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(unauthorized('Missing bearer token'));
  }
  try {
    const token = verifyToken(header.slice('Bearer '.length));
    const user = await prisma.user.findUnique({ where: { id: token.userId }, select: { role: true } });
    if (!user) return next(unauthorized('User no longer exists'));
    if (user.role === 'PENDING') return next(forbidden('Your account is awaiting administrator approval'));
    req.user = { userId: token.userId, role: asRole(user.role) };
    next();
  } catch (error) { next(error); }
};

export const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN') {
    throw forbidden('Admin role required');
  }
  next();
};

export const requirePermission = (permission: Permission) => (req: Request, _res: Response, next: NextFunction) => {
  if (!can(req.user?.role, permission)) return next(forbidden('Insufficient role for this action'));
  next();
};
