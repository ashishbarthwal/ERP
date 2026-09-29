import { prisma } from '../../lib/prisma';
import { hashPassword, verifyPassword } from '../../lib/password';
import { signToken } from '../../lib/jwt';
import { asRole } from '../../lib/permissions';
import { conflict, unauthorized } from '../../lib/errors';
import type { LoginInput, RegisterInput } from './auth.types';

export const registerUser = async (input: RegisterInput) => {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw conflict('Email already registered');
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: { email: input.email, name: input.name, passwordHash, role: input.role },
  });

  return { id: user.id, email: user.email, name: user.name, role: user.role };
};

export const loginUser = async (input: LoginInput) => {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw unauthorized('Invalid credentials');
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw unauthorized('Invalid credentials');
  }

  const token = signToken({ userId: user.id, role: asRole(user.role) });
  return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
};

export const getCurrentUser = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw unauthorized('User no longer exists');
  }
  return { id: user.id, email: user.email, name: user.name, role: user.role };
};
