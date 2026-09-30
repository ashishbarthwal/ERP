import { prisma } from '../../lib/prisma';

export const analyticsPeriods = [7, 30, 90] as const;
export type AnalyticsPeriod = (typeof analyticsPeriods)[number];

export function parseAnalyticsPeriod(value: unknown): AnalyticsPeriod {
  const days = Number(value ?? 30);
  return analyticsPeriods.includes(days as AnalyticsPeriod) ? days as AnalyticsPeriod : 30;
}

export async function getAnalytics(days: AnalyticsPeriod, now = new Date()) {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days + 1));
  const until = now;
  const [invoices, payments, receivables, salesOrders, purchaseOrders, openPurchases, products] = await Promise.all([
    prisma.invoice.findMany({ where: { createdAt: { gte: since, lte: until } }, include: { items: { include: { product: true } } } }),
    prisma.payment.findMany({ where: { createdAt: { gte: since, lte: until } } }),
    prisma.invoice.findMany({ where: { status: 'PENDING' }, include: { payments: true } }),
    prisma.order.findMany({ where: { createdAt: { gte: since, lte: until } }, select: { status: true, invoice: { select: { id: true } } } }),
    prisma.purchaseOrder.findMany({ where: { receivedAt: { gte: since, lte: until }, status: 'RECEIVED' }, include: { items: true } }),
    prisma.purchaseOrder.findMany({ where: { status: { in: ['DRAFT', 'ORDERED'] } }, include: { items: true } }),
    prisma.product.findMany({ include: { inventoryItem: true } }),
  ]);

  const dayKey = (date: Date) => date.toISOString().slice(0, 10);
  const trend = Array.from({ length: days }, (_, offset) => ({
    date: dayKey(new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate() + offset))),
    invoicedCents: 0,
    collectedCents: 0,
    receivedCostCents: 0,
  }));
  const byDay = new Map(trend.map(row => [row.date, row]));
  const productTotals = new Map<string, { sku: string; name: string; units: number; revenueCents: number }>();
  for (const invoice of invoices) {
    byDay.get(dayKey(invoice.createdAt))!.invoicedCents += invoice.totalCents;
    for (const item of invoice.items) {
      const row = productTotals.get(item.productId) ?? { sku: item.product.sku, name: item.product.name, units: 0, revenueCents: 0 };
      row.units += item.quantity;
      row.revenueCents += item.quantity * item.unitPriceCents;
      productTotals.set(item.productId, row);
    }
  }
  for (const payment of payments) byDay.get(dayKey(payment.createdAt))!.collectedCents += payment.amountCents;
  for (const purchase of purchaseOrders) {
    byDay.get(dayKey(purchase.receivedAt!))!.receivedCostCents += purchase.items.reduce((sum, item) => sum + item.quantity * item.unitCostCents, 0);
  }

  const invoicedCents = invoices.reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const collectedCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const receivedCostCents = trend.reduce((sum, day) => sum + day.receivedCostCents, 0);
  const outstandingCents = receivables.reduce((sum, invoice) => sum + Math.max(0, invoice.totalCents - invoice.payments.reduce((paid, payment) => paid + payment.amountCents, 0)), 0);
  const overdueCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const overdueCents = receivables.filter(invoice => invoice.createdAt < overdueCutoff).reduce((sum, invoice) => sum + Math.max(0, invoice.totalCents - invoice.payments.reduce((paid, payment) => paid + payment.amountCents, 0)), 0);
  const committedPurchaseCents = openPurchases.filter(order => order.status === 'ORDERED').reduce((sum, order) => sum + order.items.reduce((value, item) => value + item.quantity * item.unitCostCents, 0), 0);
  const stockAlerts = products.filter(product => (product.inventoryItem?.availableQty ?? 0) - (product.inventoryItem?.reservedQty ?? 0) < 10);
  const topProducts = [...productTotals.values()].sort((a, b) => b.revenueCents - a.revenueCents || a.sku.localeCompare(b.sku)).slice(0, 5);
  const salesStatuses = {
    DRAFT: salesOrders.filter(order => order.status === 'DRAFT').length,
    CONFIRMED: salesOrders.filter(order => order.status === 'CONFIRMED' && !order.invoice).length,
    INVOICED: salesOrders.filter(order => Boolean(order.invoice)).length,
    CANCELLED: salesOrders.filter(order => order.status === 'CANCELLED').length,
  };
  const bucketDays = days === 7 ? 1 : days === 30 ? 3 : 7;
  const chart = [];
  for (let offset = 0; offset < trend.length; offset += bucketDays) {
    const window = trend.slice(offset, offset + bucketDays);
    chart.push({
      label: window[0].date.slice(5),
      start: window[0].date,
      end: window[window.length - 1].date,
      invoicedCents: window.reduce((sum, day) => sum + day.invoicedCents, 0),
      collectedCents: window.reduce((sum, day) => sum + day.collectedCents, 0),
    });
  }

  return {
    days, since: since.toISOString(), until: until.toISOString(),
    invoicedCents, collectedCents, outstandingCents, overdueCents,
    receivedCostCents, committedPurchaseCents, openPurchaseCount: openPurchases.length,
    salesOrderCount: salesOrders.length, invoiceCount: invoices.length,
    lowStockCount: stockAlerts.length, salesStatuses, topProducts, trend, chart,
  };
}

export function analyticsCsv(data: Awaited<ReturnType<typeof getAnalytics>>) {
  const header = 'date_utc,invoiced_cents,collected_cents,received_cost_cents';
  return [header, ...data.trend.map(day => `${day.date},${day.invoicedCents},${day.collectedCents},${day.receivedCostCents}`)].join('\r\n') + '\r\n';
}
