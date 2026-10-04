export const invoiceDueAt = (dueDate?: string, issuedAt = new Date()) =>
  dueDate ? new Date(`${dueDate}T00:00:00.000Z`) : new Date(issuedAt.getTime() + 30 * 24 * 60 * 60 * 1000);

type ReceivableInvoice = {
  dueAt: Date;
  totalCents: number;
  payments: Array<{ amountCents: number }>;
};

export const outstandingForInvoice = (invoice: ReceivableInvoice) =>
  Math.max(0, invoice.totalCents - invoice.payments.reduce((sum, payment) => sum + payment.amountCents, 0));

export const isPastDueDate = (dueAt: Date, now = new Date()) => {
  const startOfUtcToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return dueAt < startOfUtcToday;
};

export const receivableTotals = (invoices: ReceivableInvoice[], now = new Date()) => invoices.reduce((totals, invoice) => {
  const outstanding = outstandingForInvoice(invoice);
  totals.outstandingCents += outstanding;
  if (outstanding > 0) {
    totals.invoiceCount++;
    if (isPastDueDate(invoice.dueAt, now)) totals.overdueCents += outstanding;
  }
  return totals;
}, { invoiceCount: 0, outstandingCents: 0, overdueCents: 0 });
