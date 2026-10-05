import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { asRole, can } from '../lib/permissions';
import { secureCookiesAndTransport } from '../config/environment';

const SESSION_COOKIE = 'erp_session';

export const setSessionCookie = (res: Response, token: string) => {
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: secureCookiesAndTransport(), maxAge: 12 * 60 * 60 * 1000 });
};

export const clearSessionCookie = (res: Response) => {
  res.clearCookie(SESSION_COOKIE, { sameSite: 'lax', secure: secureCookiesAndTransport() });
};

// Cookie-based equivalent of middleware/auth.middleware.ts's requireAuth, for the
// server-rendered web UI (browsers can't easily attach a Bearer header on navigation).
export const requireWebAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) return res.redirect('/login');
  next();
};

// Populates res.locals.isAuthenticated for layout/nav rendering without forcing a redirect.
export const attachOptionalUser = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    try {
      const payload = verifyToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { name: true, role: true, active: true, tokenVersion: true } });
      if (!user || !user.active || (payload.tokenVersion ?? 0) !== user.tokenVersion || user.role === 'PENDING') clearSessionCookie(res);
      else {
        req.user = { userId: payload.userId, role: asRole(user.role), tokenVersion: user.tokenVersion };
        res.locals.user = { name: user.name, role: req.user.role };
      }
    } catch (error) {
      if (!(error instanceof Error && ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name))) return next(error);
      clearSessionCookie(res);
    }
  }
  res.locals.isAuthenticated = Boolean(req.user);
  res.locals.can = (permission: Parameters<typeof can>[1]) => can(req.user?.role, permission);
  const section = req.path.split('/')[1];
  const titles: Record<string, string> = {
    dashboard: 'Overview',
    account: 'Account security',
    analytics: 'Analytics',
    customers: 'Customers',
    products: 'Products',
    orders: 'Sales orders',
    invoices: 'Invoices',
    suppliers: 'Suppliers',
    'purchase-orders': 'Purchase orders',
    users: 'Users',
    register: 'Users',
    activity: 'Activity log',
  };
  res.locals.pageTitle = titles[section] ?? (section ? section.charAt(0).toUpperCase() + section.slice(1) : 'Welcome');
  next();
};

export const requireWebPermission = (permission: Parameters<typeof can>[1]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) return res.redirect('/login');
  if (!can(req.user.role, permission)) return res.status(403).render('forbidden');
  next();
};
