import type { Request, RequestHandler, Response } from 'express';

type Bucket = { count: number; resetAt: number };

export class IpRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 10_000,
  ) {}

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

export const rateLimitMiddleware = (
  limiter: IpRateLimiter,
  respond: LimitResponder = (_req, res, retryAfterSeconds) => {
    res.status(429).json({ error: `Too many attempts. Try again in ${retryAfterSeconds} seconds.` });
  },
): RequestHandler => (req, res, next) => {
  const decision = limiter.consume(req.ip || req.socket.remoteAddress || 'unknown');
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
};

export const loginAttemptLimiter = new IpRateLimiter(10, 15 * 60 * 1000);
export const signupAttemptLimiter = new IpRateLimiter(5, 15 * 60 * 1000);
