import { Router } from 'express';
import { asyncHandler } from '../../middleware/error.middleware';
import { requireAuth, requireAdmin } from '../../middleware/auth.middleware';
import { loginSchema, registerSchema } from './auth.types';
import { getCurrentUser, loginUser, registerUser } from './auth.service';
import { loginAttemptLimiter, rateLimitMiddleware } from '../../middleware/ip-rate-limit';

export const authRouter = Router();

authRouter.post(
  '/register',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    res.status(201).json({ user: await registerUser(input, req.user!.userId) });
  }),
);

authRouter.post(
  '/login',
  rateLimitMiddleware(loginAttemptLimiter),
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const result = await loginUser(input);
    res.status(200).json(result);
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUser(req.user!.userId);
    res.status(200).json(user);
  }),
);
