import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import type { InventoryMovementContext } from './inventory.types';

type Client = PrismaClient | Prisma.TransactionClient;

const lockInventoryItem = async (client: Client, productId: string) => {
  const locked = await client.$queryRaw<Array<{ productId: string }>>`
    SELECT "productId" FROM "InventoryItem" WHERE "productId" = ${productId} FOR UPDATE
  `;
  if (!locked.length) throw notFound(`No inventory record for product ${productId}`);
  return getInventoryForProduct(productId, client);
};

export const getInventoryForProduct = async (productId: string, client: Client = prisma) => {
  const item = await client.inventoryItem.findUnique({ where: { productId } });
  if (!item) {
    throw notFound(`No inventory record for product ${productId}`);
  }
  return item;
};

export const listInventoryMovements = (productId: string) =>
  prisma.inventoryMovement.findMany({
    where: { productId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

const recordMovement = (
  client: Client,
  productId: string,
  quantityDelta: number,
  reservedDelta: number,
  context: InventoryMovementContext,
) =>
  client.inventoryMovement.create({
    data: {
      productId,
      quantityDelta,
      reservedDelta,
      type: context.type,
      referenceType: context.referenceType,
      referenceId: context.referenceId,
      note: context.note,
    },
  });

export const increaseStock = async (
  client: Client,
  productId: string,
  quantity: number,
  context: InventoryMovementContext,
) => {
  await lockInventoryItem(client, productId);
  const updated = await client.inventoryItem.update({
    where: { productId },
    data: { availableQty: { increment: quantity } },
  });
  await recordMovement(client, productId, quantity, 0, context);
  return updated;
};

export const addStock = async (productId: string, quantity: number, note?: string) => {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw badRequest('Stock quantity must be a positive integer');
  }
  return prisma.$transaction((tx) =>
    increaseStock(tx, productId, quantity, {
      type: 'MANUAL_ADDITION',
      referenceType: 'MANUAL',
      note,
    }),
  );
};

// Reserves `quantity` units for a product. Must run inside the same transaction that
// creates/confirms the order so reservation is atomic with the order state change.
export const reserveStock = async (client: Client, productId: string, quantity: number, orderId?: string) => {
  const item = await lockInventoryItem(client, productId);
  const unreserved = item.availableQty - item.reservedQty;
  if (unreserved < quantity) {
    throw badRequest(`Insufficient stock for product ${productId}: requested ${quantity}, available ${unreserved}`);
  }

  const updated = await client.inventoryItem.update({
    where: { productId },
    data: { reservedQty: { increment: quantity } },
  });
  await recordMovement(client, productId, 0, quantity, {
    type: 'ORDER_RESERVATION',
    referenceType: 'ORDER',
    referenceId: orderId,
  });
  return updated;
};

// Releases previously reserved quantity (e.g. when an order is cancelled).
export const releaseStock = async (client: Client, productId: string, quantity: number, orderId?: string) => {
  const item = await lockInventoryItem(client, productId);
  if (item.reservedQty < quantity) {
    throw badRequest(`Cannot release ${quantity} reserved units for product ${productId}`);
  }
  const updated = await client.inventoryItem.update({
    where: { productId },
    data: { reservedQty: { decrement: quantity } },
  });
  await recordMovement(client, productId, 0, -quantity, {
    type: 'ORDER_RELEASE',
    referenceType: 'ORDER',
    referenceId: orderId,
  });
  return updated;
};

// Consumes reserved quantity out of on-hand stock (e.g. when an order ships/is invoiced).
export const consumeReservedStock = async (client: Client, productId: string, quantity: number, orderId?: string) => {
  const item = await lockInventoryItem(client, productId);
  if (item.reservedQty < quantity || item.availableQty < quantity) {
    throw badRequest(`Cannot consume ${quantity} reserved units for product ${productId}`);
  }
  const updated = await client.inventoryItem.update({
    where: { productId },
    data: {
      reservedQty: { decrement: quantity },
      availableQty: { decrement: quantity },
    },
  });
  await recordMovement(client, productId, -quantity, -quantity, {
    type: 'SALE_CONSUMPTION',
    referenceType: 'ORDER',
    referenceId: orderId,
  });
  return updated;
};
