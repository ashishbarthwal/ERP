import { prisma } from '../../lib/prisma';
import { hashPassword, verifyPassword } from '../../lib/password';
import { signToken } from '../../lib/jwt';
import { asRole, type Role } from '../../lib/permissions';
import { conflict, forbidden, notFound, unauthorized } from '../../lib/errors';
import type { LoginInput, RegisterInput, SignupInput } from './auth.types';

const createUser = async (input: Pick<RegisterInput, 'email' | 'name' | 'password'>, role: Role) => {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw conflict('Email already registered');
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: { email: input.email, name: input.name, passwordHash, role },
  });

  return { id: user.id, email: user.email, name: user.name, role: user.role };
};

export const registerUser = async (input: RegisterInput) => createUser(input, input.role);

export const signupUser = async (input: SignupInput) => {
  const user = await createUser(input, 'PENDING');
  return user.id;
};

export const approveUser = async (userId: string, role: Exclude<Role, 'PENDING'>) => {
  const result = await prisma.user.updateMany({ where: { id: userId, role: 'PENDING' }, data: { role } });
  if (result.count !== 1) throw notFound('Pending account not found');
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

  if (user.role === 'PENDING') throw forbidden('Your account is awaiting administrator approval');

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
