import { prisma } from '../../lib/prisma';
import { conflict, notFound } from '../../lib/errors';
import type { CreateCustomerInput } from './customers.types';

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

export const createCustomer = async (input: CreateCustomerInput) => {
  const existing = await prisma.customer.findUnique({ where: { email: input.email } });
  if (existing) {
    throw conflict('Email already registered to a customer');
  }
  return prisma.customer.create({ data: input });
};
