import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/lib/prisma';
import { updateProductReorderPoint } from '../src/modules/products/products.service';
import { createProductSchema, updateReorderPointSchema } from '../src/modules/products/products.types';

test('product reorder points default sensibly and changes are audited only when they change', async (t) => {
  assert.equal(createProductSchema.parse({ sku: 'SKU-1', name: 'Widget', priceCents: 100 }).reorderPoint, 10);
  assert.equal(updateReorderPointSchema.safeParse({ reorderPoint: 0 }).success, true);
  assert.equal(updateReorderPointSchema.safeParse({ reorderPoint: -1 }).success, false);
  assert.equal(updateReorderPointSchema.safeParse({ reorderPoint: 1.5 }).success, false);

  const productDelegate = prisma.product as any;
  const auditDelegate = prisma.auditEvent as any;
  const entries = [[prisma as any, '$transaction'], [productDelegate, 'findUnique'], [productDelegate, 'update'], [auditDelegate, 'create']] as const;
  const descriptors = entries.map(([target, name]) => [target, name, Object.getOwnPropertyDescriptor(target, name)] as const);
  t.after(() => {
    for (const [target, name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(target, name, descriptor);
      else delete target[name];
    }
  });

  const product: any = { id: 'product-1', name: 'Widget', reorderPoint: 10 };
  const auditEvents: any[] = [];
  (prisma as any).$transaction = async (callback: (tx: any) => unknown) => callback(prisma as any);
  productDelegate.findUnique = async () => ({ ...product });
  productDelegate.update = async ({ data }: any) => Object.assign(product, data);
  auditDelegate.create = async ({ data }: any) => { auditEvents.push(data); return data; };

  const updated = await updateProductReorderPoint('product-1', 6, 'inventory-user');
  assert.equal(updated.reorderPoint, 6);
  assert.equal(auditEvents.length, 1);
  assert.match(auditEvents[0].summary, /from 10 to 6 units/);

  await updateProductReorderPoint('product-1', 6, 'inventory-user');
  assert.equal(auditEvents.length, 1);
});
