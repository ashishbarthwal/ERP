import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prisma } from '../src/lib/prisma';
import { approveUser, changePassword, changeUserRole, loginUser, setUserActive, signupUser } from '../src/modules/auth/auth.service';
import { approveUserSchema, changePasswordSchema, changeUserRoleSchema, registerSchema, signupSchema } from '../src/modules/auth/auth.types';
import { requireAuth } from '../src/middleware/auth.middleware';
import { signToken } from '../src/lib/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { verifyAccountEmail, resetPassword } from '../src/modules/auth/auth.service';

test('public signup stays pending until an administrator assigns a role', async (t) => {
  process.env.JWT_SECRET = 'test-only-signup-secret';
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  const records = new Map<string, any>();
  const delegate = prisma.user as any;
  const originals = ['findUnique', 'create', 'updateMany', 'update', 'count'].map(name => [name, Object.getOwnPropertyDescriptor(delegate, name)] as const);
  const audit = prisma.auditEvent as any;
  const auditRecords: any[] = [];
  const auditOriginal = Object.getOwnPropertyDescriptor(audit, 'create');
  const tokenDelegate = prisma.accountActionToken as any;
  const tokenRecords = new Map<string, any>();
  const tokenOriginals = ['findFirst', 'findUnique', 'create', 'updateMany', 'deleteMany'].map(name => [name, Object.getOwnPropertyDescriptor(tokenDelegate, name)] as const);
  const transactionOriginal = Object.getOwnPropertyDescriptor(prisma, '$transaction');
  const queryRawOriginal = Object.getOwnPropertyDescriptor(prisma, '$queryRaw');
  t.after(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(delegate, name, descriptor);
      else delete delegate[name];
    }
    if (auditOriginal) Object.defineProperty(audit, 'create', auditOriginal);
    else delete audit.create;
    if (transactionOriginal) Object.defineProperty(prisma, '$transaction', transactionOriginal);
    else delete (prisma as any).$transaction;
    if (queryRawOriginal) Object.defineProperty(prisma, '$queryRaw', queryRawOriginal);
    else delete (prisma as any).$queryRaw;
    for (const [name, descriptor] of tokenOriginals) {
      if (descriptor) Object.defineProperty(tokenDelegate, name, descriptor);
      else delete tokenDelegate[name];
    }
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });
  records.set('admin@example.test', {
    id: 'admin-id', email: 'admin@example.test', name: 'Admin', passwordHash: 'unused',
    role: 'ADMIN', active: true, tokenVersion: 0, emailVerifiedAt: new Date(),
  });
  (prisma as any).$transaction = async (callback: (tx: any) => unknown) => callback(prisma as any);
  (prisma as any).$queryRaw = async (parts: TemplateStringsArray, ...values: any[]) => {
    if (parts.join('').includes('WHERE "id" =')) {
      return [...records.values()].filter(user => user.id === values[0]).map(user => ({ id: user.id }));
    }
    return [...records.values()].filter(user => user.role === 'ADMIN' && user.active).map(user => ({ id: user.id }));
  };
  audit.create = async ({ data }: any) => {
    auditRecords.push(data);
    return { id: 'audit-event', ...data };
  };
  tokenDelegate.findFirst = async ({ where }: any) => [...tokenRecords.values()].find(token => token.userId === where.userId && token.purpose === where.purpose && !token.consumedAt && token.createdAt > where.createdAt.gt) ?? null;
  tokenDelegate.findUnique = async ({ where, include }: any) => {
    const token = [...tokenRecords.values()].find(record => record.tokenHash === where.tokenHash);
    if (!token) return null;
    return include?.user ? { ...token, user: [...records.values()].find(user => user.id === token.userId) } : token;
  };
  tokenDelegate.create = async ({ data }: any) => {
    const token = { ...data, id: `token-${tokenRecords.size + 1}`, createdAt: new Date(), consumedAt: null };
    tokenRecords.set(token.id, token);
    return token;
  };
  tokenDelegate.updateMany = async ({ where, data }: any) => {
    const candidates = where.id ? [tokenRecords.get(where.id)].filter(Boolean) : [...tokenRecords.values()].filter((token: any) =>
      token.userId === where.userId && (!where.purpose || token.purpose === where.purpose) && (!where.consumedAt || !token.consumedAt));
    const matches = candidates.filter((token: any) => !token.consumedAt && (!where.expiresAt?.gt || token.expiresAt > where.expiresAt.gt));
    for (const token of matches) Object.assign(token, data);
    return { count: matches.length };
  };
  tokenDelegate.deleteMany = async () => ({ count: 0 });
  delegate.findUnique = async ({ where }: any) =>
    where.email ? records.get(where.email) ?? null : [...records.values()].find(user => user.id === where.id) ?? null;
  delegate.findUniqueOrThrow = async ({ where }: any) => {
    const user = [...records.values()].find(user => user.id === where.id);
    if (!user) throw new Error('User not found');
    return user;
  };
  delegate.create = async ({ data }: any) => {
    const user = { ...data, id: 'new-user' };
    records.set(user.email, user);
    return user;
  };
  delegate.updateMany = async ({ where, data }: any) => {
    const user = [...records.values()].find(user => Object.entries(where).every(([key, value]: [string, any]) =>
      value && typeof value === 'object' && 'not' in value ? user[key] !== value.not : user[key] === value));
    if (!user) return { count: 0 };
    const { tokenVersion, ...fields } = data;
    Object.assign(user, fields);
    if (tokenVersion?.increment) user.tokenVersion += tokenVersion.increment;
    return { count: 1 };
  };
  delegate.update = async ({ where, data }: any) => {
    const user = [...records.values()].find(user => user.id === where.id);
    if (!user) throw new Error('User not found');
    const { tokenVersion, ...fields } = data;
    Object.assign(user, fields);
    if (tokenVersion?.increment) user.tokenVersion += tokenVersion.increment;
    return user;
  };
  delegate.count = async ({ where }: any) => [...records.values()].filter(user => user.role === where.role && user.active === where.active).length;

  assert.equal(signupSchema.safeParse({ name: 'New Operator', email: 'new@example.test', password: 'Password123!', confirmPassword: 'different' }).success, false);
  assert.equal(registerSchema.safeParse({ name: 'New Operator', email: 'new@example.test', password: 'short-pass', role: 'STAFF' }).success, false);
  assert.equal(registerSchema.safeParse({ name: 'New Operator', email: 'new@example.test', password: 'é'.repeat(37), role: 'STAFF' }).success, false);
  const input = signupSchema.parse({ name: 'New Operator', email: 'NEW@example.test', password: 'Password123!', confirmPassword: 'Password123!', role: 'ADMIN' });
  const id = await signupUser(input);
  assert.equal(records.get(input.email).role, 'PENDING');
  assert.equal(id, 'new-user');
  assert.equal(approveUserSchema.safeParse({ role: 'PENDING' }).success, false);
  await assert.rejects(loginUser({ email: input.email, password: input.password }), { statusCode: 403 });
  await assert.rejects(loginUser({ email: input.email, password: 'wrong' }), { statusCode: 401 });
  await assert.rejects(approveUser(id, 'SALES', 'admin-id'), { statusCode: 404 });
  const verificationToken = randomBytes(32).toString('base64url');
  await tokenDelegate.create({ data: {
    userId: id, purpose: 'EMAIL_VERIFICATION', tokenHash: createHash('sha256').update(verificationToken).digest('hex'),
    expiresAt: new Date(Date.now() + 60_000),
  } });
  await verifyAccountEmail(verificationToken);
  assert.ok(records.get(input.email).emailVerifiedAt);
  await assert.rejects(verifyAccountEmail(verificationToken), { statusCode: 400 });

  const pendingToken = signToken({ userId: id, role: 'PENDING' });
  const middlewareError = await new Promise<any>(resolve =>
    requireAuth({ headers: { authorization: `Bearer ${pendingToken}` } } as any, {} as any, resolve));
  assert.equal(middlewareError.statusCode, 403);

  await approveUser(id, approveUserSchema.parse({ role: 'SALES' }).role, 'admin-id');
  const oldPendingSessionError = await new Promise<any>(resolve =>
    requireAuth({ headers: { authorization: `Bearer ${pendingToken}` } } as any, {} as any, resolve));
  assert.equal(oldPendingSessionError.statusCode, 401);
  const session = await loginUser({ email: input.email, password: input.password });
  assert.equal(session.user.role, 'SALES');
  assert.ok(session.token);
  await setUserActive(id, false, 'admin-id');
  await assert.rejects(loginUser({ email: input.email, password: input.password }), { statusCode: 401 });
  const deactivatedSessionError = await new Promise<any>(resolve =>
    requireAuth({ headers: { authorization: `Bearer ${session.token}` } } as any, {} as any, resolve));
  assert.equal(deactivatedSessionError.statusCode, 401);
  await setUserActive(id, true, 'admin-id');
  const stillRevokedSessionError = await new Promise<any>(resolve =>
    requireAuth({ headers: { authorization: `Bearer ${session.token}` } } as any, {} as any, resolve));
  assert.equal(stillRevokedSessionError.statusCode, 401);
  const activeSession = await loginUser({ email: input.email, password: input.password });
  assert.equal(activeSession.user.role, 'SALES');
  assert.equal(changeUserRoleSchema.safeParse({ role: 'PENDING' }).success, false);
  await changeUserRole(id, 'INVENTORY', 'admin-id');
  const roleChangeRevocation = await new Promise<any>(resolve =>
    requireAuth({ headers: { authorization: `Bearer ${activeSession.token}` } } as any, {} as any, resolve));
  assert.equal(roleChangeRevocation.statusCode, 401);
  assert.equal((await loginUser({ email: input.email, password: input.password })).user.role, 'INVENTORY');
  await changeUserRole(id, 'SALES', 'admin-id');
  await assert.rejects(changeUserRole('admin-id', 'STAFF', 'admin-id'), { statusCode: 409 });
  const passwordChange = changePasswordSchema.parse({
    currentPassword: input.password, newPassword: 'New-Password-2026!', confirmPassword: 'New-Password-2026!',
  });
  assert.equal(changePasswordSchema.safeParse({ ...passwordChange, confirmPassword: 'different' }).success, false);
  const staleRecoveryToken = randomBytes(32).toString('base64url');
  await tokenDelegate.create({ data: {
    userId: id, purpose: 'PASSWORD_RESET', tokenHash: createHash('sha256').update(staleRecoveryToken).digest('hex'),
    expiresAt: new Date(Date.now() + 60_000),
  } });
  await changePassword(id, passwordChange);
  await assert.rejects(resetPassword(staleRecoveryToken, 'Stale-Reset-2026!'), { statusCode: 400 });
  const credentialChangeRevocation = await new Promise<any>(resolve =>
    requireAuth({ headers: { authorization: `Bearer ${activeSession.token}` } } as any, {} as any, resolve));
  assert.equal(credentialChangeRevocation.statusCode, 401);
  await assert.rejects(loginUser({ email: input.email, password: input.password }), { statusCode: 401 });
  const newCredentialSession = await loginUser({ email: input.email, password: passwordChange.newPassword });
  const currentSessionError = await new Promise<any>(resolve =>
    requireAuth({ headers: { authorization: `Bearer ${newCredentialSession.token}` } } as any, {} as any, resolve));
  assert.equal(currentSessionError, undefined);
  const recoveryToken = randomBytes(32).toString('base64url');
  await tokenDelegate.create({ data: {
    userId: id, purpose: 'PASSWORD_RESET', tokenHash: createHash('sha256').update(recoveryToken).digest('hex'),
    expiresAt: new Date(Date.now() + 60_000),
  } });
  await resetPassword(recoveryToken, 'Reset-Password-2026!');
  await assert.rejects(resetPassword(recoveryToken, 'Another-Reset-2026!'), { statusCode: 400 });
  const resetSessionError = await new Promise<any>(resolve =>
    requireAuth({ headers: { authorization: `Bearer ${newCredentialSession.token}` } } as any, {} as any, resolve));
  assert.equal(resetSessionError.statusCode, 401);
  await assert.rejects(loginUser({ email: input.email, password: passwordChange.newPassword }), { statusCode: 401 });
  assert.equal((await loginUser({ email: input.email, password: 'Reset-Password-2026!' })).user.role, 'SALES');
  await assert.rejects(setUserActive('admin-id', false, 'admin-id'), { statusCode: 409 });
  assert.deepEqual(auditRecords.filter(event => event.entityId === id).map(event => event.action), [
    'user.signup_requested', 'user.email_verified', 'user.approved', 'user.deactivated', 'user.reactivated', 'user.role_changed', 'user.role_changed', 'user.password_changed', 'user.password_reset',
  ]);
  await assert.rejects(approveUser(id, 'ADMIN', 'admin-id'), { statusCode: 404 });
  await prisma.$disconnect();
});
