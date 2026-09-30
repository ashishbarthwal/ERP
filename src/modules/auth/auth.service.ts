import { prisma } from '../../lib/prisma';
import { hashPassword, verifyPassword } from '../../lib/password';
import { signToken } from '../../lib/jwt';
import { asRole, type Role } from '../../lib/permissions';
import { conflict, forbidden, notFound, unauthorized } from '../../lib/errors';
import type { LoginInput, RegisterInput, SignupInput } from './auth.types';
import { recordAuditEvent } from '../audit/audit.service';

const createUser = async (input: Pick<RegisterInput, 'email' | 'name' | 'password'>, role: Role, actorId: string | null) => {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw conflict('Email already registered');
  }

  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: input.email, name: input.name, passwordHash, role, active: true, tokenVersion: 0 },
    });
    await recordAuditEvent(tx, { actorId, action: role === 'PENDING' ? 'user.signup_requested' : 'user.created',
      entityType: 'User', entityId: user.id, summary: role === 'PENDING'
        ? `Account request submitted for ${user.name}` : `Created ${role.toLowerCase()} account for ${user.name}` });
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  });
};

export const registerUser = async (input: RegisterInput, actorId: string) => createUser(input, input.role, actorId);

export const signupUser = async (input: SignupInput) => {
  const user = await createUser(input, 'PENDING', null);
  return user.id;
};

export const approveUser = async (userId: string, role: Exclude<Role, 'PENDING'>, actorId: string) => prisma.$transaction(async (tx) => {
  const result = await tx.user.updateMany({ where: { id: userId, role: 'PENDING' }, data: { role, tokenVersion: { increment: 1 } } });
  if (result.count !== 1) throw notFound('Pending account not found');
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  await recordAuditEvent(tx, { actorId, action: 'user.approved', entityType: 'User', entityId: userId,
    summary: `Approved ${user.name} as ${role.toLowerCase()}` });
});

export const setUserActive = async (userId: string, active: boolean, actorId: string) => prisma.$transaction(async (tx) => {
  if (!active) {
    // Serialize Admin account changes so concurrent deactivation requests cannot
    // remove every active administrator at once.
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User" WHERE "role" = 'ADMIN' AND "active" = true ORDER BY "id" FOR UPDATE
    `;
  }
  const targetLock = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
  `;
  if (!targetLock.length) throw notFound('Approved workspace user not found');
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, active: true } });
  if (!actor?.active || actor.role !== 'ADMIN') throw forbidden('An active Admin account is required');
  if (userId === actorId) throw conflict('You cannot change access for your own account');

  const target = await tx.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, active: true } });
  if (!target || target.role === 'PENDING') throw notFound('Approved workspace user not found');
  if (target.active === active) return;
  if (!active && target.role === 'ADMIN') {
    const admins = await tx.user.count({ where: { role: 'ADMIN', active: true } });
    if (admins <= 1) throw conflict('At least one active administrator must remain');
  }

  await tx.user.update({
    where: { id: userId },
    data: { active, tokenVersion: { increment: 1 } },
  });
  await recordAuditEvent(tx, {
    actorId, action: active ? 'user.reactivated' : 'user.deactivated', entityType: 'User', entityId: userId,
    summary: `${active ? 'Reactivated' : 'Deactivated'} account for ${target.name}`,
  });
});

export const loginUser = async (input: LoginInput) => {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw unauthorized('Invalid credentials');
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw unauthorized('Invalid credentials');
  }

  if (!user.active) throw unauthorized('Invalid credentials');

  if (user.role === 'PENDING') throw forbidden('Your account is awaiting administrator approval');

  const token = signToken({ userId: user.id, role: asRole(user.role), tokenVersion: user.tokenVersion });
  return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
};

export const getCurrentUser = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw unauthorized('User no longer exists');
  }
  return { id: user.id, email: user.email, name: user.name, role: user.role };
};
