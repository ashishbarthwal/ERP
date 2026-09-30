import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { increaseStock } from '../inventory/inventory.service';
import type { CreatePurchaseOrderInput } from './purchasing.types';
import { recordAuditEvent } from '../audit/audit.service';

const purchaseOrderInclude = {
  supplier: true,
  items: { include: { product: true } },
} as const;

export const listPurchaseOrders = () =>
  prisma.purchaseOrder.findMany({
    include: purchaseOrderInclude,
    orderBy: { createdAt: 'desc' },
  });

export const getPurchaseOrder = async (id: string) => {
  const purchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id }, include: purchaseOrderInclude });
  if (!purchaseOrder) {
    throw notFound(`Purchase order ${id} not found`);
  }
  return purchaseOrder;
};

export const createPurchaseOrder = async (input: CreatePurchaseOrderInput, actorId: string) => {
  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier) {
    throw notFound(`Supplier ${input.supplierId} not found`);
  }

  const productIds = input.items.map((item) => item.productId);
  if (productIds.length !== new Set(productIds).size) {
    throw badRequest('A purchase order cannot contain duplicate product lines');
  }
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  if (products.length !== productIds.length) {
    throw badRequest('One or more products do not exist');
  }

  return prisma.$transaction(async (tx) => {
    const purchaseOrder = await tx.purchaseOrder.create({
      data: {
        supplierId: input.supplierId,
        items: { create: input.items },
      },
      include: purchaseOrderInclude,
    });
    await recordAuditEvent(tx, { actorId, action: 'purchase_order.created', entityType: 'PurchaseOrder', entityId: purchaseOrder.id,
      summary: `Created purchase order for ${purchaseOrder.supplier.name}` });
    return purchaseOrder;
  });
};

export const submitPurchaseOrder = async (id: string, actorId: string) => prisma.$transaction(async (tx) => {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${id} FOR UPDATE
  `;
  if (!locked.length) throw notFound(`Purchase order ${id} not found`);
  const purchaseOrder = await tx.purchaseOrder.findUnique({ where: { id }, include: purchaseOrderInclude });
  if (!purchaseOrder) throw notFound(`Purchase order ${id} not found`);
  if (purchaseOrder.status !== 'DRAFT') {
    throw badRequest(`Only DRAFT purchase orders can be submitted (current status: ${purchaseOrder.status})`);
  }
  const submitted = await tx.purchaseOrder.update({
    where: { id },
    data: { status: 'ORDERED', orderedAt: new Date() },
    include: purchaseOrderInclude,
  });
  await recordAuditEvent(tx, { actorId, action: 'purchase_order.submitted', entityType: 'PurchaseOrder', entityId: id,
    summary: `Submitted purchase order to ${purchaseOrder.supplier.name}` });
  return submitted;
});

export const receivePurchaseOrder = async (id: string, actorId: string, idempotencyKey?: string) =>
  prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${id} FOR UPDATE
    `;
    if (!locked.length) throw notFound(`Purchase order ${id} not found`);
    const purchaseOrder = await tx.purchaseOrder.findUnique({ where: { id }, include: purchaseOrderInclude });
    if (!purchaseOrder) {
      throw notFound(`Purchase order ${id} not found`);
    }
    if (purchaseOrder.status === 'RECEIVED' && idempotencyKey && purchaseOrder.receiptIdempotencyKey === idempotencyKey) {
      return purchaseOrder;
    }
    if (purchaseOrder.status !== 'ORDERED') {
      throw badRequest(`Only ORDERED purchase orders can be received (current status: ${purchaseOrder.status})`);
    }

    for (const item of purchaseOrder.items) {
      await increaseStock(tx, item.productId, item.quantity, {
        type: 'PURCHASE_RECEIPT',
        referenceType: 'PURCHASE_ORDER',
        referenceId: purchaseOrder.id,
        note: `Received from ${purchaseOrder.supplier.name}`,
      });
    }

    const received = await tx.purchaseOrder.update({
      where: { id },
      data: { status: 'RECEIVED', receivedAt: new Date(), receiptIdempotencyKey: idempotencyKey ?? null },
      include: purchaseOrderInclude,
    });
    await recordAuditEvent(tx, { actorId, action: 'purchase_order.received', entityType: 'PurchaseOrder', entityId: id,
      summary: `Received purchase order from ${purchaseOrder.supplier.name}` });
    return received;
  });

export const cancelPurchaseOrder = async (id: string, actorId: string) => prisma.$transaction(async (tx) => {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${id} FOR UPDATE
  `;
  if (!locked.length) throw notFound(`Purchase order ${id} not found`);
  const purchaseOrder = await tx.purchaseOrder.findUnique({ where: { id }, include: purchaseOrderInclude });
  if (!purchaseOrder) throw notFound(`Purchase order ${id} not found`);
  if (purchaseOrder.status === 'RECEIVED') {
    throw badRequest('A received purchase order cannot be cancelled');
  }
  if (purchaseOrder.status === 'CANCELLED') {
    throw badRequest('Purchase order is already cancelled');
  }
  const cancelled = await tx.purchaseOrder.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: purchaseOrderInclude,
  });
  await recordAuditEvent(tx, { actorId, action: 'purchase_order.cancelled', entityType: 'PurchaseOrder', entityId: id,
    summary: `Cancelled purchase order to ${purchaseOrder.supplier.name}` });
  return cancelled;
});
