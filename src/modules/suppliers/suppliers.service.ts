import { prisma } from '../../lib/prisma';
import { conflict, notFound } from '../../lib/errors';
import type { CreateSupplierInput } from './suppliers.types';

export const listSuppliers = () => prisma.supplier.findMany({ orderBy: { createdAt: 'desc' } });

export const getSupplier = async (id: string) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: { purchaseOrders: { orderBy: { createdAt: 'desc' } } },
  });
  if (!supplier) {
    throw notFound(`Supplier ${id} not found`);
  }
  return supplier;
};

export const createSupplier = async (input: CreateSupplierInput) => {
  const existing = await prisma.supplier.findUnique({ where: { email: input.email } });
  if (existing) {
    throw conflict('Email already registered to a supplier');
  }
  return prisma.supplier.create({ data: input });
};

