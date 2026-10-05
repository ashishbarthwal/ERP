import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/lib/prisma';
import { adjustStock } from '../src/modules/inventory/inventory.service';
import { adjustStockSchema } from '../src/modules/inventory/inventory.types';

test('stock count corrections require a reason and preserve reservations across retries', async (t) => {
  assert.equal(adjustStockSchema.safeParse({ quantityDelta: -2, reason: 'Cycle count' }).success, true);
  assert.equal(adjustStockSchema.safeParse({ quantityDelta: 0, reason: 'Cycle count' }).success, false);
  assert.equal(adjustStockSchema.safeParse({ quantityDelta: -2, reason: '  ' }).success, false);

  const movementDelegate = prisma.inventoryMovement as any;
  const inventoryDelegate = prisma.inventoryItem as any;
  const auditDelegate = prisma.auditEvent as any;
  const originals = [
    [prisma as any, '$transaction'], [prisma as any, '$queryRaw'],
    [movementDelegate, 'findUnique'], [movementDelegate, 'create'],
    [inventoryDelegate, 'findUnique'], [inventoryDelegate, 'update'], [auditDelegate, 'create'],
  ] as const;
  const descriptors = originals.map(([target, name]) => [target, name, Object.getOwnPropertyDescriptor(target, name)] as const);
  t.after(() => {
    for (const [target, name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(target, name, descriptor);
      else delete target[name];
    }
  });

  let availableQty = 12;
  const reservedQty = 4;
  const movements = new Map<string, any>();
  const audits: any[] = [];
  (prisma as any).$transaction = async (callback: (tx: any) => unknown) => callback(prisma as any);
  (prisma as any).$queryRaw = async (parts: TemplateStringsArray) => parts.join('').includes('pg_advisory_xact_lock')
    ? [{ locked: true }]
    : [{ productId: 'product-1' }];
  movementDelegate.findUnique = async ({ where }: any) => movements.get(where.idempotencyKeyHash) ?? null;
  movementDelegate.create = async ({ data }: any) => {
    movements.set(data.idempotencyKeyHash, { id: 'movement-1', ...data });
    return { id: 'movement-1', ...data };
  };
  inventoryDelegate.findUnique = async () => ({ productId: 'product-1', availableQty, reservedQty });
  inventoryDelegate.update = async ({ data }: any) => {
    availableQty += data.availableQty.increment;
    return { productId: 'product-1', availableQty, reservedQty };
  };
  auditDelegate.create = async ({ data }: any) => { audits.push(data); return data; };

  const adjusted = await adjustStock('product-1', -3, 'Cycle count shortage', 'user-1', 'cycle-count-key-1');
  assert.equal(adjusted.availableQty, 9);
  assert.equal(movements.size, 1);
  assert.equal(audits.length, 1);

  const retry = await adjustStock('product-1', -3, 'Cycle count shortage', 'user-1', 'cycle-count-key-1');
  assert.equal(retry.availableQty, 9);
  assert.equal(movements.size, 1);
  assert.equal(audits.length, 1);

  await assert.rejects(
    adjustStock('product-1', 2, 'Different correction', 'user-1', 'cycle-count-key-1'),
    /Idempotency key was already used/,
  );
  await assert.rejects(
    adjustStock('product-1', -6, 'Below reservations', 'user-1', 'cycle-count-key-2'),
    /below 4 reserved units/,
  );
  assert.equal(availableQty, 9);
  assert.equal(movements.size, 1);
  assert.equal(audits.length, 1);
});
