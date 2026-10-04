import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { increaseStock } from '../inventory/inventory.service';
import type { CreatePurchaseOrderInput, ReceivePurchaseOrderInput } from './purchasing.types';
import { recordAuditEvent } from '../audit/audit.service';

const purchaseOrderInclude = {
  supplier: true,
  items: { include: { product: true } },
} as const;
const purchaseOrderDetailInclude = {
  ...purchaseOrderInclude,
  receipts: {
    orderBy: { createdAt: 'desc' as const },
    include: { items: { include: { purchaseOrderItem: { include: { product: true } } } } },
  },
} as const;

export const listPurchaseOrders = () =>
  prisma.purchaseOrder.findMany({
    include: purchaseOrderInclude,
    orderBy: { createdAt: 'desc' },
  });

export const getPurchaseOrder = async (id: string) => {
  const purchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id }, include: purchaseOrderDetailInclude });
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

export const receivePurchaseOrder = async (
  id: string,
  actorId: string,
  idempotencyKey?: string,
  input?: ReceivePurchaseOrderInput,
) =>
  prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${id} FOR UPDATE
    `;
    if (!locked.length) throw notFound(`Purchase order ${id} not found`);
    const purchaseOrder = await tx.purchaseOrder.findUnique({ where: { id }, include: purchaseOrderDetailInclude });
    if (!purchaseOrder) {
      throw notFound(`Purchase order ${id} not found`);
    }
    const requestHash = input
      ? createHash('sha256').update(JSON.stringify([...input.items].sort((a, b) => a.purchaseOrderItemId.localeCompare(b.purchaseOrderItemId)))).digest('hex')
      : 'all-remaining';
    const key = idempotencyKey ?? randomUUID();
    const prior = await tx.purchaseReceipt.findUnique({
      where: { purchaseOrderId_idempotencyKey: { purchaseOrderId: id, idempotencyKey: key } },
    });
    if (prior) {
      if (prior.requestHash !== 'legacy' && prior.requestHash !== requestHash) {
        throw conflict('Idempotency key was already used for a different purchase receipt');
      }
      return purchaseOrder;
    }
    if (!['ORDERED', 'PARTIALLY_RECEIVED'].includes(purchaseOrder.status)) {
      throw badRequest(`Only ORDERED or PARTIALLY_RECEIVED purchase orders can be received (current status: ${purchaseOrder.status})`);
    }

    const requested = input?.items ?? purchaseOrder.items
      .filter((item) => item.receivedQty < item.quantity)
      .map((item) => ({ purchaseOrderItemId: item.id, quantity: item.quantity - item.receivedQty }));
    if (!requested.length) throw badRequest('There are no outstanding purchase order quantities to receive');
    const itemById = new Map(purchaseOrder.items.map((item) => [item.id, item]));
    const seenLines = new Set<string>();
    for (const receiptLine of requested) {
      if (!Number.isInteger(receiptLine.quantity) || receiptLine.quantity <= 0 || seenLines.has(receiptLine.purchaseOrderItemId)) {
        throw badRequest('Receipt quantities must be positive whole numbers with one entry per purchase order line');
      }
      seenLines.add(receiptLine.purchaseOrderItemId);
      const item = itemById.get(receiptLine.purchaseOrderItemId);
      if (!item) throw badRequest('Receipt contains a line that does not belong to this purchase order');
      const remaining = item.quantity - item.receivedQty;
      if (receiptLine.quantity > remaining) {
        throw badRequest(`Cannot receive ${receiptLine.quantity} units; only ${remaining} remain for ${item.product.name}`);
      }
    }

    const receipt = await tx.purchaseReceipt.create({
      data: {
        purchaseOrderId: id,
        idempotencyKey: key,
        requestHash,
        items: { create: requested.map(({ purchaseOrderItemId, quantity }) => ({ purchaseOrderItemId, quantity })) },
      },
    });
    for (const receiptLine of requested) {
      const item = itemById.get(receiptLine.purchaseOrderItemId)!;
      await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { receivedQty: { increment: receiptLine.quantity } } });
      await increaseStock(tx, item.productId, receiptLine.quantity, {
        type: 'PURCHASE_RECEIPT',
        referenceType: 'PURCHASE_ORDER',
        referenceId: purchaseOrder.id,
        note: `Receipt ${receipt.id.slice(0, 12)} from ${purchaseOrder.supplier.name}`,
      });
    }

    const complete = purchaseOrder.items.every((item) =>
      item.receivedQty + (requested.find((line) => line.purchaseOrderItemId === item.id)?.quantity ?? 0) === item.quantity,
    );
    const received = await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
        receivedAt: complete ? new Date() : null,
        receiptIdempotencyKey: complete ? key : null,
      },
      include: purchaseOrderDetailInclude,
    });
    const units = requested.reduce((sum, line) => sum + line.quantity, 0);
    await recordAuditEvent(tx, { actorId, action: complete ? 'purchase_order.received' : 'purchase_order.partially_received', entityType: 'PurchaseOrder', entityId: id,
      summary: `Received ${units} units from ${purchaseOrder.supplier.name}${complete ? ' and completed the order' : ''}` });
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
    throw badRequest('A fully received purchase order cannot be cancelled');
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
