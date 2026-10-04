import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/lib/prisma';
import { receivePurchaseOrder } from '../src/modules/purchasing/purchasing.service';
import { receivePurchaseOrderSchema } from '../src/modules/purchasing/purchasing.types';

test('purchase receipts support partial deliveries, safe retries, and completion', async (t) => {
  assert.equal(receivePurchaseOrderSchema.safeParse({ items: [{ purchaseOrderItemId: 'line-1', quantity: 2 }] }).success, true);
  assert.equal(receivePurchaseOrderSchema.safeParse({ items: [{ purchaseOrderItemId: 'line-1', quantity: 2 }, { purchaseOrderItemId: 'line-1', quantity: 3 }] }).success, false);
  assert.equal(receivePurchaseOrderSchema.safeParse({ items: [] }).success, false);

  const delegates = [
    [prisma as any, '$transaction'], [prisma as any, '$queryRaw'],
    [prisma.purchaseOrder as any, 'findUnique'], [prisma.purchaseOrder as any, 'update'],
    [prisma.purchaseOrderItem as any, 'update'],
    [prisma.purchaseReceipt as any, 'findUnique'], [prisma.purchaseReceipt as any, 'create'],
    [prisma.inventoryItem as any, 'findUnique'], [prisma.inventoryItem as any, 'update'],
    [prisma.inventoryMovement as any, 'create'], [prisma.auditEvent as any, 'create'],
  ] as const;
  const descriptors = delegates.map(([target, name]) => [target, name, Object.getOwnPropertyDescriptor(target, name)] as const);
  t.after(() => {
    for (const [target, name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(target, name, descriptor);
      else delete target[name];
    }
  });

  const order: any = {
    id: 'po-1', status: 'ORDERED', receivedAt: null, supplier: { name: 'Northwind Supply' },
    items: [{ id: 'line-1', purchaseOrderId: 'po-1', productId: 'product-1', quantity: 10, receivedQty: 0,
      unitCostCents: 125, product: { id: 'product-1', name: 'Widget' } }],
    receipts: [],
  };
  let availableQty = 5;
  const receiptByKey = new Map<string, any>();
  const movements: any[] = [];
  const audits: any[] = [];
  let receiptCount = 0;

  (prisma as any).$transaction = async (callback: (tx: any) => unknown) => callback(prisma as any);
  (prisma as any).$queryRaw = async (parts: TemplateStringsArray) => parts.join('').includes('FROM "PurchaseOrder"')
    ? [{ id: 'po-1' }]
    : [{ productId: 'product-1' }];
  (prisma.purchaseOrder as any).findUnique = async () => structuredClone(order);
  (prisma.purchaseOrder as any).update = async ({ data }: any) => {
    Object.assign(order, data);
    return order;
  };
  (prisma.purchaseOrderItem as any).update = async ({ data }: any) => {
    order.items[0].receivedQty += data.receivedQty.increment;
    return order.items[0];
  };
  (prisma.purchaseReceipt as any).findUnique = async ({ where }: any) =>
    receiptByKey.get(`${where.purchaseOrderId_idempotencyKey.purchaseOrderId}:${where.purchaseOrderId_idempotencyKey.idempotencyKey}`) ?? null;
  (prisma.purchaseReceipt as any).create = async ({ data }: any) => {
    const receipt = { id: `receipt-${++receiptCount}`, createdAt: new Date(), ...data };
    receiptByKey.set(`${data.purchaseOrderId}:${data.idempotencyKey}`, receipt);
    order.receipts.push(receipt);
    return receipt;
  };
  (prisma.inventoryItem as any).findUnique = async () => ({ productId: 'product-1', availableQty, reservedQty: 0 });
  (prisma.inventoryItem as any).update = async ({ data }: any) => {
    availableQty += data.availableQty.increment;
    return { productId: 'product-1', availableQty, reservedQty: 0 };
  };
  (prisma.inventoryMovement as any).create = async ({ data }: any) => { movements.push(data); return data; };
  (prisma.auditEvent as any).create = async ({ data }: any) => { audits.push(data); return data; };

  const firstInput = { items: [{ purchaseOrderItemId: 'line-1', quantity: 4 }] };
  const first = await receivePurchaseOrder('po-1', 'buyer-1', 'delivery-batch-1', firstInput);
  assert.equal(first.status, 'PARTIALLY_RECEIVED');
  assert.equal(order.items[0].receivedQty, 4);
  assert.equal(availableQty, 9);
  assert.equal(movements.length, 1);
  assert.equal(movements[0].quantityDelta, 4);
  assert.equal(audits.length, 1);

  await receivePurchaseOrder('po-1', 'buyer-1', 'delivery-batch-1', firstInput);
  assert.equal(order.items[0].receivedQty, 4);
  assert.equal(availableQty, 9);
  assert.equal(receiptCount, 1);
  assert.equal(audits.length, 1);

  await assert.rejects(
    receivePurchaseOrder('po-1', 'buyer-1', 'delivery-batch-1', { items: [{ purchaseOrderItemId: 'line-1', quantity: 3 }] }),
    /Idempotency key was already used for a different purchase receipt/,
  );
  await assert.rejects(
    receivePurchaseOrder('po-1', 'buyer-1', 'delivery-batch-2', { items: [{ purchaseOrderItemId: 'line-1', quantity: 7 }] }),
    /only 6 remain/,
  );
  assert.equal(order.items[0].receivedQty, 4);
  assert.equal(availableQty, 9);
  assert.equal(receiptCount, 1);

  const final = await receivePurchaseOrder('po-1', 'buyer-1', 'delivery-batch-3', { items: [{ purchaseOrderItemId: 'line-1', quantity: 6 }] });
  assert.equal(final.status, 'RECEIVED');
  assert.equal(order.items[0].receivedQty, 10);
  assert.equal(availableQty, 15);
  assert.equal(receiptCount, 2);
  assert.equal(audits.length, 2);
  assert.equal(audits[1].action, 'purchase_order.received');
});
