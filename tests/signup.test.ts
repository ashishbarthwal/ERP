import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prisma } from '../src/lib/prisma';
import { approveUser, loginUser, signupUser } from '../src/modules/auth/auth.service';
import { approveUserSchema, signupSchema } from '../src/modules/auth/auth.types';
import { requireAuth } from '../src/middleware/auth.middleware';
import { signToken } from '../src/lib/jwt';

test('public signup stays pending until an administrator assigns a role', async (t) => {
  process.env.JWT_SECRET = 'test-only-signup-secret';
  const records = new Map<string, any>();
  const delegate = prisma.user as any;
  const originals = ['findUnique', 'create', 'updateMany'].map(name => [name, Object.getOwnPropertyDescriptor(delegate, name)] as const);
  const audit = prisma.auditEvent as any;
  const auditOriginal = Object.getOwnPropertyDescriptor(audit, 'create');
  const transactionOriginal = Object.getOwnPropertyDescriptor(prisma, '$transaction');
  t.after(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(delegate, name, descriptor);
    }
    if (auditOriginal) Object.defineProperty(audit, 'create', auditOriginal);
    if (transactionOriginal) Object.defineProperty(prisma, '$transaction', transactionOriginal);
  });
  (prisma as any).$transaction = async (callback: (tx: any) => unknown) => callback(prisma as any);
  audit.create = async ({ data }: any) => ({ id: 'audit-event', ...data });
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
    const user = [...records.values()].find(user => user.id === where.id && user.role === where.role);
    if (!user) return { count: 0 };
    user.role = data.role;
    return { count: 1 };
  };

  assert.equal(signupSchema.safeParse({ name: 'New Operator', email: 'new@example.test', password: 'Password123!', confirmPassword: 'different' }).success, false);
  const input = signupSchema.parse({ name: 'New Operator', email: 'NEW@example.test', password: 'Password123!', confirmPassword: 'Password123!', role: 'ADMIN' });
  const id = await signupUser(input);
  assert.equal(records.get(input.email).role, 'PENDING');
  assert.equal(id, 'new-user');
  assert.equal(approveUserSchema.safeParse({ role: 'PENDING' }).success, false);
  await assert.rejects(loginUser({ email: input.email, password: input.password }), { statusCode: 403 });
  await assert.rejects(loginUser({ email: input.email, password: 'wrong' }), { statusCode: 401 });

  const pendingToken = signToken({ userId: id, role: 'PENDING' });
  const middlewareError = await new Promise<any>(resolve =>
    requireAuth({ headers: { authorization: `Bearer ${pendingToken}` } } as any, {} as any, resolve));
  assert.equal(middlewareError.statusCode, 403);

  await approveUser(id, approveUserSchema.parse({ role: 'SALES' }).role, 'admin-id');
  const session = await loginUser({ email: input.email, password: input.password });
  assert.equal(session.user.role, 'SALES');
  assert.ok(session.token);
  await assert.rejects(approveUser(id, 'ADMIN', 'admin-id'), { statusCode: 404 });
  await prisma.$disconnect();
});
