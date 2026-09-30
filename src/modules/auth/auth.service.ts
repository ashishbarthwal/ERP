import { prisma } from '../../lib/prisma';
import { hashPassword, verifyPassword } from '../../lib/password';
import { signToken } from '../../lib/jwt';
import { asRole, type Role } from '../../lib/permissions';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../../lib/errors';
import type { ChangePasswordInput, LoginInput, RegisterInput, SignupInput } from './auth.types';
import { recordAuditEvent } from '../audit/audit.service';
import { createHash, randomBytes } from 'node:crypto';
import { sendAccountActionEmail } from '../../lib/account-email';

type ActionPurpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
const actionTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const issueActionToken = async (userId: string, purpose: ActionPurpose) => {
  const now = new Date();
  const rawToken = randomBytes(32).toString('base64url');
  const inserted = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const recent = await tx.accountActionToken.findFirst({
      where: { userId, purpose, consumedAt: null, createdAt: { gt: new Date(now.getTime() - 60_000) } },
      select: { id: true },
    });
    if (recent) return false;
    await tx.accountActionToken.deleteMany({ where: { expiresAt: { lte: now } } });
    await tx.accountActionToken.updateMany({
      where: { userId, purpose, consumedAt: null }, data: { consumedAt: now },
    });
    await tx.accountActionToken.create({ data: {
      userId, purpose, tokenHash: actionTokenHash(rawToken), expiresAt: new Date(now.getTime() + 30 * 60_000),
    } });
    return true;
  });
  return inserted ? rawToken : null;
};

const notifyAccountAction = (user: { id: string; email: string; name: string }, purpose: ActionPurpose, rawToken: string) => {
  void sendAccountActionEmail({ to: user.email, name: user.name, purpose, rawToken })
    .catch(() => console.error(`Account ${purpose === 'EMAIL_VERIFICATION' ? 'verification' : 'recovery'} email delivery failed`));
};

const createUser = async (input: Pick<RegisterInput, 'email' | 'name' | 'password'>, role: Role, actorId: string | null) => {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw conflict('Email already registered');
  }

  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: input.email, name: input.name, passwordHash, role, active: true, tokenVersion: 0,
        emailVerifiedAt: role === 'PENDING' ? null : new Date() },
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
  const rawToken = await issueActionToken(user.id, 'EMAIL_VERIFICATION');
  if (rawToken) notifyAccountAction(user, 'EMAIL_VERIFICATION', rawToken);
  return user.id;
};

export const resendEmailVerification = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, role: true, emailVerifiedAt: true } });
  if (!user || user.role !== 'PENDING' || user.emailVerifiedAt) return;
  const rawToken = await issueActionToken(user.id, 'EMAIL_VERIFICATION');
  if (rawToken) notifyAccountAction(user, 'EMAIL_VERIFICATION', rawToken);
};

export const verifyAccountEmail = async (rawToken: string) => {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(rawToken)) throw badRequest('This verification link is invalid or expired.');
  const token = await prisma.accountActionToken.findUnique({
    where: { tokenHash: actionTokenHash(rawToken) },
    include: { user: { select: { id: true, name: true, emailVerifiedAt: true } } },
  });
  const now = new Date();
  if (!token || token.purpose !== 'EMAIL_VERIFICATION' || token.consumedAt || token.expiresAt <= now || token.user.emailVerifiedAt) {
    throw badRequest('This verification link is invalid or expired.');
  }
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${token.userId} FOR UPDATE`;
    const claimed = await tx.accountActionToken.updateMany({
      where: { id: token.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now },
    });
    if (claimed.count !== 1) throw badRequest('This verification link is invalid or expired.');
    const updated = await tx.user.updateMany({ where: { id: token.userId, emailVerifiedAt: null }, data: { emailVerifiedAt: now } });
    if (updated.count !== 1) throw badRequest('This verification link is invalid or expired.');
    await recordAuditEvent(tx, { actorId: token.userId, action: 'user.email_verified', entityType: 'User', entityId: token.userId,
      summary: `Verified email address for ${token.user.name}` });
  });
};

export const requestPasswordReset = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, role: true, active: true, emailVerifiedAt: true } });
  if (!user || !user.active || user.role === 'PENDING' || !user.emailVerifiedAt) return;
  const rawToken = await issueActionToken(user.id, 'PASSWORD_RESET');
  if (rawToken) notifyAccountAction(user, 'PASSWORD_RESET', rawToken);
};

export const resetPassword = async (rawToken: string, password: string) => {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(rawToken)) throw badRequest('This recovery link is invalid or expired.');
  const token = await prisma.accountActionToken.findUnique({ where: { tokenHash: actionTokenHash(rawToken) } });
  const now = new Date();
  if (!token || token.purpose !== 'PASSWORD_RESET' || token.consumedAt || token.expiresAt <= now) {
    throw badRequest('This recovery link is invalid or expired.');
  }
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${token.userId} FOR UPDATE`;
    const claimed = await tx.accountActionToken.updateMany({
      where: { id: token.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now },
    });
    if (claimed.count !== 1) throw badRequest('This recovery link is invalid or expired.');
    const changed = await tx.user.updateMany({
      where: { id: token.userId, active: true, role: { not: 'PENDING' }, emailVerifiedAt: { not: null } },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    if (changed.count !== 1) throw badRequest('This recovery link is invalid or expired.');
    await recordAuditEvent(tx, { actorId: token.userId, action: 'user.password_reset', entityType: 'User', entityId: token.userId,
      summary: 'Reset account password using a verified email link' });
    await tx.accountActionToken.updateMany({ where: { userId: token.userId, purpose: 'PASSWORD_RESET', consumedAt: null }, data: { consumedAt: now } });
  });
};

export const approveUser = async (userId: string, role: Exclude<Role, 'PENDING'>, actorId: string) => prisma.$transaction(async (tx) => {
  const result = await tx.user.updateMany({ where: { id: userId, role: 'PENDING', emailVerifiedAt: { not: null } }, data: { role, tokenVersion: { increment: 1 } } });
  if (result.count !== 1) throw notFound('Pending account not found');
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  await recordAuditEvent(tx, { actorId, action: 'user.approved', entityType: 'User', entityId: userId,
    summary: `Approved ${user.name} as ${role.toLowerCase()}` });
});

export const changeUserRole = async (userId: string, role: Exclude<Role, 'PENDING'>, actorId: string) => prisma.$transaction(async (tx) => {
  // Match the Admin lock order used by account deactivation, then lock the target.
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "User" WHERE "role" = 'ADMIN' AND "active" = true ORDER BY "id" FOR UPDATE
  `;
  const targetLock = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
  `;
  if (!targetLock.length) throw notFound('Approved workspace user not found');
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, active: true } });
  if (!actor?.active || actor.role !== 'ADMIN') throw forbidden('An active Admin account is required');
  if (userId === actorId) throw conflict('You cannot change your own role');

  const target = await tx.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, active: true } });
  if (!target || target.role === 'PENDING') throw notFound('Approved workspace user not found');
  if (target.role === role) return;
  if (target.active && target.role === 'ADMIN' && role !== 'ADMIN') {
    const admins = await tx.user.count({ where: { role: 'ADMIN', active: true } });
    if (admins <= 1) throw conflict('At least one active administrator must remain');
  }

  const result = await tx.user.updateMany({
    where: { id: userId, role: target.role, active: target.active },
    data: { role, tokenVersion: { increment: 1 } },
  });
  if (result.count !== 1) throw conflict('Account role changed. Refresh and try again.');
  await recordAuditEvent(tx, {
    actorId, action: 'user.role_changed', entityType: 'User', entityId: userId,
    summary: `Changed ${target.name}'s role from ${target.role.toLowerCase()} to ${role.toLowerCase()}`,
  });
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
  if (!active) {
    await tx.accountActionToken.updateMany({
      where: { userId, purpose: 'PASSWORD_RESET', consumedAt: null }, data: { consumedAt: new Date() },
    });
  }
  await recordAuditEvent(tx, {
    actorId, action: active ? 'user.reactivated' : 'user.deactivated', entityType: 'User', entityId: userId,
    summary: `${active ? 'Reactivated' : 'Deactivated'} account for ${target.name}`,
  });
});

export const changePassword = async (userId: string, input: ChangePasswordInput) => {
  const user = await prisma.user.findUnique({
    where: { id: userId }, select: { id: true, passwordHash: true, tokenVersion: true, active: true },
  });
  if (!user?.active) throw unauthorized();
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw badRequest('Current password is incorrect');
  }
  if (await verifyPassword(input.newPassword, user.passwordHash)) {
    throw badRequest('Choose a password different from your current password');
  }
  const passwordHash = await hashPassword(input.newPassword);

  await prisma.$transaction(async (tx) => {
    const result = await tx.user.updateMany({
      where: { id: user.id, passwordHash: user.passwordHash, tokenVersion: user.tokenVersion, active: true },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    if (result.count !== 1) throw conflict('Account credentials changed. Sign in and try again.');
    await tx.accountActionToken.updateMany({
      where: { userId: user.id, purpose: 'PASSWORD_RESET', consumedAt: null }, data: { consumedAt: new Date() },
    });
    await recordAuditEvent(tx, {
      actorId: userId, action: 'user.password_changed', entityType: 'User', entityId: userId,
      summary: 'Changed account password',
    });
  });
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

  if (!user.active) throw unauthorized('Invalid credentials');

  if (!user.emailVerifiedAt) throw forbidden('Verify your email address before signing in. Request a new link below.');
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
