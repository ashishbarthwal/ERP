import { prisma } from '../../lib/prisma';
import { conflict, notFound } from '../../lib/errors';
import type { CreateProductInput } from './products.types';

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
export const createProduct = async (input: CreateProductInput) => {
  const existing = await prisma.product.findUnique({ where: { sku: input.sku } });
  if (existing) {
    throw conflict('SKU already exists');
  }

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({ data: input });
    await tx.inventoryItem.create({ data: { productId: product.id } });
    return tx.product.findUniqueOrThrow({ where: { id: product.id }, include: { inventoryItem: true } });
  });
};
