import { prisma } from '../../lib/prisma';
import { conflict, notFound } from '../../lib/errors';
import type { CreateProductInput } from './products.types';
import { recordAuditEvent } from '../audit/audit.service';

export const listProducts = () =>
  prisma.product.findMany({ include: { inventoryItem: true }, orderBy: { createdAt: 'desc' } });

export const getProduct = async (id: string) => {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      inventoryItem: true,
      inventoryMovements: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!product) {
    throw notFound(`Product ${id} not found`);
  }
  return product;
};

// Creating a product always creates its (zero-quantity) inventory row in the same
// transaction, so every product is guaranteed to have exactly one inventory record.
export const createProduct = async (input: CreateProductInput, actorId: string) => {
  const existing = await prisma.product.findUnique({ where: { sku: input.sku } });
  if (existing) {
    throw conflict('SKU already exists');
  }

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({ data: input });
    await tx.inventoryItem.create({ data: { productId: product.id } });
    const created = await tx.product.findUniqueOrThrow({ where: { id: product.id }, include: { inventoryItem: true } });
    await recordAuditEvent(tx, { actorId, action: 'product.created', entityType: 'Product', entityId: product.id,
      summary: `Created product ${product.name} (${product.sku}) with reorder point ${product.reorderPoint}` });
    return created;
  });
};

export const updateProductReorderPoint = async (id: string, reorderPoint: number, actorId: string) => prisma.$transaction(async (tx) => {
  const product = await tx.product.findUnique({ where: { id } });
  if (!product) throw notFound(`Product ${id} not found`);
  if (product.reorderPoint === reorderPoint) return product;
  const updated = await tx.product.update({ where: { id }, data: { reorderPoint } });
  await recordAuditEvent(tx, { actorId, action: 'product.reorder_point_changed', entityType: 'Product', entityId: id,
    summary: `Changed ${product.name} reorder point from ${product.reorderPoint} to ${reorderPoint} units` });
  return updated;
});
