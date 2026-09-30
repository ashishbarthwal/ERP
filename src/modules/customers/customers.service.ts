import { prisma } from '../../lib/prisma';
import { conflict, notFound } from '../../lib/errors';
import type { CreateCustomerInput } from './customers.types';
import { recordAuditEvent } from '../audit/audit.service';

export const listCustomers = () => prisma.customer.findMany({ orderBy: { createdAt: 'desc' } });

export const getCustomer = async (id: string) => {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { orders: { orderBy: { createdAt: 'desc' } } },
  });
  if (!customer) {
    throw notFound(`Customer ${id} not found`);
  }
  return customer;
};

export const createCustomer = async (input: CreateCustomerInput, actorId: string) => {
  const existing = await prisma.customer.findUnique({ where: { email: input.email } });
  if (existing) {
    throw conflict('Email already registered to a customer');
  }
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({ data: input });
    await recordAuditEvent(tx, { actorId, action: 'customer.created', entityType: 'Customer', entityId: customer.id,
      summary: `Created customer ${customer.name}` });
    return customer;
  });
};
