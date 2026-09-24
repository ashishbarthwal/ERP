import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../lib/jwt';

const SESSION_COOKIE = 'erp_session';

export const setSessionCookie = (res: Response, token: string) => {
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 12 * 60 * 60 * 1000 });
};

export const clearSessionCookie = (res: Response) => {
  res.clearCookie(SESSION_COOKIE);
};

// Cookie-based equivalent of middleware/auth.middleware.ts's requireAuth, for the
// server-rendered web UI (browsers can't easily attach a Bearer header on navigation).
export const requireWebAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    return res.redirect('/login');
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    clearSessionCookie(res);
    res.redirect('/login');
  }
};

// Populates res.locals.isAuthenticated for layout/nav rendering without forcing a redirect.
export const attachOptionalUser = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch {
      clearSessionCookie(res);
    }
  }
  res.locals.isAuthenticated = Boolean(req.user);
  const section = req.path.split('/')[1];
  const titles: Record<string, string> = {
    dashboard: 'Overview',
    customers: 'Customers',
    products: 'Products',
    orders: 'Sales orders',
    invoices: 'Invoices',
    suppliers: 'Suppliers',
    'purchase-orders': 'Purchase orders',
  };
  res.locals.pageTitle = titles[section] ?? (section ? section.charAt(0).toUpperCase() + section.slice(1) : 'Welcome');
  next();
};
