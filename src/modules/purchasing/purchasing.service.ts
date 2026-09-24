import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { increaseStock } from '../inventory/inventory.service';
import type { CreatePurchaseOrderInput } from './purchasing.types';

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

export const createPurchaseOrder = async (input: CreatePurchaseOrderInput) => {
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

  return prisma.purchaseOrder.create({
    data: {
      supplierId: input.supplierId,
      items: { create: input.items },
    },
    include: purchaseOrderInclude,
  });
};

export const submitPurchaseOrder = async (id: string) => {
  const purchaseOrder = await getPurchaseOrder(id);
  if (purchaseOrder.status !== 'DRAFT') {
    throw badRequest(`Only DRAFT purchase orders can be submitted (current status: ${purchaseOrder.status})`);
  }
  return prisma.purchaseOrder.update({
    where: { id },
    data: { status: 'ORDERED', orderedAt: new Date() },
    include: purchaseOrderInclude,
  });
};

export const receivePurchaseOrder = async (id: string) =>
  prisma.$transaction(async (tx) => {
    const purchaseOrder = await tx.purchaseOrder.findUnique({ where: { id }, include: purchaseOrderInclude });
    if (!purchaseOrder) {
      throw notFound(`Purchase order ${id} not found`);
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

    return tx.purchaseOrder.update({
      where: { id },
      data: { status: 'RECEIVED', receivedAt: new Date() },
      include: purchaseOrderInclude,
    });
  });

export const cancelPurchaseOrder = async (id: string) => {
  const purchaseOrder = await getPurchaseOrder(id);
  if (purchaseOrder.status === 'RECEIVED') {
    throw badRequest('A received purchase order cannot be cancelled');
  }
  if (purchaseOrder.status === 'CANCELLED') {
    throw badRequest('Purchase order is already cancelled');
  }
  return prisma.purchaseOrder.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: purchaseOrderInclude,
  });
};
