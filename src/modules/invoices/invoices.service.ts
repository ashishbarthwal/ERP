import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { consumeReservedStock } from '../inventory/inventory.service';
import type { CreateInvoiceInput, RecordPaymentInput } from './invoices.types';
import { recordAuditEvent } from '../audit/audit.service';

const invoiceInclude = {
  items: { include: { product: true } },
  payments: true,
  order: { include: { customer: true } },
} as const;

export const listInvoices = () =>
  prisma.invoice.findMany({
    include: invoiceInclude,
    orderBy: { createdAt: 'desc' },
  });

export const getInvoice = async (id: string) => {
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: invoiceInclude });
  if (!invoice) {
    throw notFound(`Invoice ${id} not found`);
  }
  return invoice;
};

// Generating an invoice snapshots the order's items/prices, consumes the reserved
// stock those items were holding (goods are considered shipped/billed at this point
// in our simplified workflow), and totals the invoice from the line items.
export const createInvoice = async (input: CreateInvoiceInput, actorId: string) => {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Order" WHERE "id" = ${input.orderId} FOR UPDATE
    `;
    if (!locked.length) throw notFound(`Order ${input.orderId} not found`);
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: { items: true, invoice: true },
    });
    if (!order) throw notFound(`Order ${input.orderId} not found`);
    if (order.status !== 'CONFIRMED') {
      throw badRequest(`Only CONFIRMED orders can be invoiced (current status: ${order.status})`);
    }
    if (order.invoice) throw badRequest('Order already has an invoice');
    const totalCents = order.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
    for (const item of order.items) {
      await consumeReservedStock(tx, item.productId, item.quantity, order.id);
    }

    const invoice = await tx.invoice.create({
      data: {
        orderId: order.id,
        totalCents,
        items: {
          create: order.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
          })),
        },
      },
      include: invoiceInclude,
    });
    await recordAuditEvent(tx, { actorId, action: 'invoice.issued', entityType: 'Invoice', entityId: invoice.id,
      summary: `Issued invoice for sales order ${order.id}` });
    return invoice;
  });
};

// Payments accumulate against an invoice; once the sum reaches the total the invoice
// becomes PAID. Overpayment and payment against a non-PENDING invoice are rejected.
export const recordPayment = async (invoiceId: string, input: RecordPaymentInput, actorId: string) => {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceId} FOR UPDATE
    `;
    if (!locked.length) throw notFound(`Invoice ${invoiceId} not found`);
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: invoiceInclude });
    if (!invoice) throw notFound(`Invoice ${invoiceId} not found`);
    if (invoice.status !== 'PENDING') {
      throw badRequest(`Only PENDING invoices accept payments (current status: ${invoice.status})`);
    }

    const alreadyPaid = invoice.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
    const newTotal = alreadyPaid + input.amountCents;
    if (newTotal > invoice.totalCents) {
      throw badRequest(
        `Payment of ${input.amountCents} would exceed invoice total (outstanding: ${invoice.totalCents - alreadyPaid})`,
      );
    }
    await tx.payment.create({
      data: { invoiceId, amountCents: input.amountCents, method: input.method ?? 'manual' },
    });

    const isFullyPaid = newTotal === invoice.totalCents;
    const updatedInvoice = await tx.invoice.update({
      where: { id: invoiceId },
      data: isFullyPaid ? { status: 'PAID', paidAt: new Date() } : {},
      include: invoiceInclude,
    });
    await recordAuditEvent(tx, { actorId, action: 'invoice.payment_recorded', entityType: 'Invoice', entityId: invoiceId,
      summary: `Recorded payment of $${(input.amountCents / 100).toFixed(2)}${isFullyPaid ? ' and marked invoice paid' : ''}` });
    return updatedInvoice;
  });
};
