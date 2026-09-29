import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const COOKIE = 'erp_csrf';
const validNonce = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) return next(new Error('JWT_SECRET is not configured'));

  let nonce = req.cookies?.[COOKIE];
  if (!validNonce(nonce)) {
    if (req.method === 'POST') return res.status(403).render('forbidden');
    nonce = randomBytes(32).toString('hex');
    res.cookie(COOKIE, nonce, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
  }

  // Bind the form token to both the browser nonce and the current login session.
  const session = req.user ? String(req.cookies?.erp_session ?? '') : 'guest';
  const expected = createHmac('sha256', secret).update(nonce).update('\0').update(session).digest('hex');
  res.locals.csrfToken = expected;

  if (req.method === 'POST') {
    const supplied = req.body?._csrf;
    if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied) ||
        !timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'))) {
      return res.status(403).render('forbidden');
    }
  }
  next();
};
