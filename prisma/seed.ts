// Seeds a minimal, deterministic data set for local development and Playwright tests.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const databaseHost = new URL(process.env.DATABASE_URL || '').hostname;
  const localDatabase = ['localhost', '127.0.0.1', '::1'].includes(databaseHost);
  const seedPassword = process.env.ERP_SEED_ADMIN_PASSWORD || (localDatabase ? 'Password123!' : '');
  if (!seedPassword || seedPassword.length < 12) {
    throw new Error('Set ERP_SEED_ADMIN_PASSWORD (at least 12 characters) before seeding a hosted database');
  }
  const passwordHash = await bcrypt.hash(seedPassword, 10);
  await prisma.user.upsert({
    where: { email: 'admin@mini-erp.test' },
    update: {},
    create: { email: 'admin@mini-erp.test', name: 'Admin', passwordHash, role: 'ADMIN' },
  });

  const customer = await prisma.customer.upsert({
    where: { email: 'jane.doe@example.com' },
    update: {},
    create: { name: 'Jane Doe', email: 'jane.doe@example.com', phone: '555-0100' },
  });

  const product = await prisma.product.upsert({
    where: { sku: 'WIDGET-001' },
    update: {},
    create: {
      sku: 'WIDGET-001',
      name: 'Widget',
      description: 'A basic seeded widget',
      priceCents: 1999,
      inventoryItem: { create: { availableQty: 50, reservedQty: 0 } },
    },
  });

  const supplier = await prisma.supplier.upsert({
    where: { email: 'supply@example.com' },
    update: {},
    create: { name: 'Northwind Supply Co.', email: 'supply@example.com', phone: '555-0142' },
  });

  console.log('Seeded:', { customer: customer.email, product: product.sku, supplier: supplier.email });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
