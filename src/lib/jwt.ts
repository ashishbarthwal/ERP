import jwt from 'jsonwebtoken';
import type { Role } from './permissions';

export interface AuthTokenPayload {
  userId: string;
  role: Role;
  tokenVersion?: number;
}

const getSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
};

export const signToken = (payload: AuthTokenPayload): string =>
  jwt.sign(payload, getSecret(), { expiresIn: '12h' });

export const verifyToken = (token: string): AuthTokenPayload => jwt.verify(token, getSecret()) as AuthTokenPayload;
