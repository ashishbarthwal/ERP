import type { Request, RequestHandler, Response } from 'express';
import { createHmac } from 'node:crypto';
import { prisma } from '../lib/prisma';

type Bucket = { count: number; resetAt: number };

export class IpRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private currentLimit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 10_000,
  ) {}

  get limit() { return this.currentLimit; }

  setLimit(limit: number) { this.currentLimit = limit; }

  consume(ip: string) {
    const now = this.now();
    let bucket = this.buckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      if (!bucket && this.buckets.size >= this.maxKeys) {
        for (const [key, value] of this.buckets) {
          if (value.resetAt <= now) this.buckets.delete(key);
        }
      }
      if (!bucket && this.buckets.size >= this.maxKeys) {
        return { allowed: false, remaining: 0, resetAt: now + this.windowMs };
      }
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(ip, bucket);
    }

    if (bucket.count >= this.limit) {
      return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
    }
    bucket.count += 1;
    return { allowed: true, remaining: this.limit - bucket.count, resetAt: bucket.resetAt };
  }
}

type LimitResponder = (req: Request, res: Response, retryAfterSeconds: number) => void;

interface RateLimiter {
  readonly limit: number;
  consume(ip: string): { allowed: boolean; remaining: number; resetAt: number } | Promise<{ allowed: boolean; remaining: number; resetAt: number }>;
}

export class SharedIpRateLimiter {
  private currentLimit: number;
  private cleanupCounter = 0;

  constructor(
    limit: number,
    private readonly windowMs: number,
    private readonly scope: string,
    private readonly now: () => number = Date.now,
  ) {
    this.currentLimit = limit;
  }

  get limit() { return this.currentLimit; }

  setLimit(limit: number) { this.currentLimit = limit; }

  async consume(ip: string) {
    const now = this.now();
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be configured before rate limiting');
    const key = createHmac('sha256', secret).update(`${this.scope}:${ip}`).digest('hex');
    const resetAt = new Date(now + this.windowMs);

    this.cleanupCounter += 1;
    if (this.cleanupCounter >= 512) {
      this.cleanupCounter = 0;
      await prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lte: new Date(now) } } });
    }

    const rows = await prisma.$queryRaw<Array<{ count: number; resetAt: Date }>>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimitBucket"."resetAt" <= ${new Date(now)} THEN 1
          ELSE LEAST("RateLimitBucket"."count" + 1, ${this.limit + 1})
        END,
        "resetAt" = CASE
          WHEN "RateLimitBucket"."resetAt" <= ${new Date(now)} THEN ${resetAt}
          ELSE "RateLimitBucket"."resetAt"
        END
      RETURNING "count", "resetAt"
    `;
    const bucket = rows[0];
    if (!bucket) throw new Error('Rate limit counter could not be updated');
    return {
      allowed: bucket.count <= this.limit,
      remaining: Math.max(0, this.limit - bucket.count),
      resetAt: bucket.resetAt.getTime(),
    };
  }
}

export const rateLimitMiddleware = (
  limiter: RateLimiter,
  respond: LimitResponder = (_req, res, retryAfterSeconds) => {
    res.status(429).json({ error: `Too many attempts. Try again in ${retryAfterSeconds} seconds.` });
  },
): RequestHandler => (req, res, next) => {
  Promise.resolve(limiter.consume(req.ip || req.socket.remoteAddress || 'unknown')).then((decision) => {
    const resetInSeconds = Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1000));
    res.setHeader('RateLimit-Limit', String(limiter.limit));
    res.setHeader('RateLimit-Remaining', String(decision.remaining));
    res.setHeader('RateLimit-Reset', String(resetInSeconds));
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(resetInSeconds));
      respond(req, res, resetInSeconds);
      return;
    }
    next();
  }).catch(next);
};

export const loginAttemptLimiter = new SharedIpRateLimiter(10, 15 * 60 * 1000, 'login');
export const signupAttemptLimiter = new SharedIpRateLimiter(5, 15 * 60 * 1000, 'signup');
export const passwordResetAttemptLimiter = new SharedIpRateLimiter(5, 15 * 60 * 1000, 'password-reset');

export const configureAuthAttemptLimits = (loginLimit: number, signupLimit: number) => {
  loginAttemptLimiter.setLimit(loginLimit);
  signupAttemptLimiter.setLimit(signupLimit);
};
