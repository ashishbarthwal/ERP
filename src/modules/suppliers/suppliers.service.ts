import { prisma } from '../../lib/prisma';
import { conflict, notFound } from '../../lib/errors';
import type { CreateSupplierInput } from './suppliers.types';
import { recordAuditEvent } from '../audit/audit.service';

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

export const createSupplier = async (input: CreateSupplierInput, actorId: string) => {
  const existing = await prisma.supplier.findUnique({ where: { email: input.email } });
  if (existing) {
    throw conflict('Email already registered to a supplier');
  }
  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.create({ data: input });
    await recordAuditEvent(tx, { actorId, action: 'supplier.created', entityType: 'Supplier', entityId: supplier.id,
      summary: `Created supplier ${supplier.name}` });
    return supplier;
  });
};

