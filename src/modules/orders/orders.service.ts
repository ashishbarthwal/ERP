import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { reserveStock, releaseStock } from '../inventory/inventory.service';
import type { CreateOrderInput } from './orders.types';

const orderInclude = { items: { include: { product: true } }, customer: true, invoice: true } as const;

export const listOrders = () =>
  prisma.order.findMany({
    include: orderInclude,
    orderBy: { createdAt: 'desc' },
  });

export const getOrder = async (id: string) => {
  const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
  if (!order) {
    throw notFound(`Order ${id} not found`);
  }
  return order;
};

// Order is created as DRAFT with a price snapshot per item (protects historical
// totals from later product price changes) but does not touch inventory yet.
export const createOrder = async (input: CreateOrderInput) => {
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) {
    throw notFound(`Customer ${input.customerId} not found`);
  }

  const productIds = input.items.map((item) => item.productId);
  if (productIds.length !== new Set(productIds).size) {
    throw badRequest('An order cannot contain duplicate product lines');
  }
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  if (products.length !== productIds.length) {
    throw badRequest('One or more products do not exist');
  }
  const priceByProductId = new Map(products.map((product) => [product.id, product.priceCents]));

  return prisma.order.create({
    data: {
      customerId: input.customerId,
      items: {
        create: input.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPriceCents: priceByProductId.get(item.productId)!,
        })),
      },
    },
    include: orderInclude,
  });
};

// Confirming reserves stock for every line item atomically: either all items reserve
// successfully or the whole confirmation is rolled back (no partial reservation).
export const confirmOrder = async (id: string) => {
  const order = await getOrder(id);
  if (order.status !== 'DRAFT') {
    throw badRequest(`Only DRAFT orders can be confirmed (current status: ${order.status})`);
  }

  return prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      await reserveStock(tx, item.productId, item.quantity, order.id);
    }
    return tx.order.update({
      where: { id },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
      include: orderInclude,
    });
  });
};

// Cancelling a CONFIRMED order releases every reservation it holds; DRAFT orders have
// no reservations yet so cancellation is a plain status change.
export const cancelOrder = async (id: string) => {
  const order = await getOrder(id);
  if (order.status === 'CANCELLED') {
    throw badRequest('Order is already cancelled');
  }
  if (order.invoice) {
    throw badRequest('An invoiced order cannot be cancelled');
  }

  return prisma.$transaction(async (tx) => {
    if (order.status === 'CONFIRMED') {
      for (const item of order.items) {
        await releaseStock(tx, item.productId, item.quantity, order.id);
      }
    }
    return tx.order.update({ where: { id }, data: { status: 'CANCELLED' }, include: orderInclude });
  });
};
