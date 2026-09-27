import path from 'node:path';
import { Router } from 'express';
import { ZodError } from 'zod';
import { AppError, badRequest } from '../lib/errors';
import { requireWebAuth } from './web.middleware';
import { setSessionCookie, clearSessionCookie } from './web.middleware';
import { loginSchema, registerSchema } from '../modules/auth/auth.types';
import { getCurrentUser, loginUser, registerUser } from '../modules/auth/auth.service';
import { createCustomerSchema } from '../modules/customers/customers.types';
import { createCustomer, getCustomer, listCustomers } from '../modules/customers/customers.service';
import { createProductSchema } from '../modules/products/products.types';
import { createProduct, getProduct, listProducts } from '../modules/products/products.service';
import { addStock } from '../modules/inventory/inventory.service';
import { createOrderSchema } from '../modules/orders/orders.types';
import { cancelOrder, confirmOrder, createOrder, getOrder, listOrders } from '../modules/orders/orders.service';
import { createInvoiceSchema, recordPaymentSchema } from '../modules/invoices/invoices.types';
import { createInvoice, getInvoice, listInvoices, recordPayment } from '../modules/invoices/invoices.service';
import { createSupplierSchema } from '../modules/suppliers/suppliers.types';
import { createSupplier, getSupplier, listSuppliers } from '../modules/suppliers/suppliers.service';
import { createPurchaseOrderSchema } from '../modules/purchasing/purchasing.types';
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  receivePurchaseOrder,
  submitPurchaseOrder,
} from '../modules/purchasing/purchasing.service';
import { analyticsCsv, getAnalytics, parseAnalyticsPeriod } from '../modules/analytics/analytics.service';

export const webViewsPath = path.join(__dirname, 'views');

export const webRouter = Router();

const errorMessage = (err: unknown) => {
  if (err instanceof AppError) return err.message;
  if (err instanceof ZodError) return err.issues.map((issue) => issue.message).join(', ');
  return 'Something went wrong';
};

// Form bodies submit numbers/arrays as strings; this coerces the raw `items[i][...]`
// shape express.urlencoded produces into the typed input the order service expects.
const parseOrderItems = (rawItems: unknown): { productId: string; quantity: number }[] => {
  const list = Array.isArray(rawItems) ? rawItems : Object.values(rawItems ?? {});
  return list
    .map((raw: any) => ({ productId: String(raw?.productId ?? ''), quantity: Number(raw?.quantity ?? 0) }))
    .filter((item) => item.productId && item.quantity > 0);
};

const parsePurchaseOrderItems = (
  rawItems: unknown,
): { productId: string; quantity: number; unitCostCents: number }[] => {
  const list = Array.isArray(rawItems) ? rawItems : Object.values(rawItems ?? {});
  return list
    .map((raw: any) => ({
      productId: String(raw?.productId ?? ''),
      quantity: Number(raw?.quantity ?? 0),
      unitCostCents: Number(raw?.unitCostCents ?? -1),
    }))
    .filter((item) => item.productId && item.quantity > 0 && item.unitCostCents >= 0);
};

const parseDollarsToCents = (value: unknown): number => {
  const amount = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) throw badRequest('Enter a payment amount with no more than two decimal places');
  const [dollars, fraction = ''] = amount.split('.');
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0) throw badRequest('Enter a positive payment amount');
  return cents;
};

webRouter.get('/', (req, res) => res.redirect(req.user ? '/dashboard' : '/login'));

webRouter.get('/login', (req, res) => {
  res.render('login', { error: req.query.error });
});

webRouter.post('/login', async (req, res) => {
  try {
    const input = loginSchema.parse(req.body);
    const { token } = await loginUser(input);
    setSessionCookie(res, token);
    res.redirect('/dashboard');
  } catch (err) {
    res.redirect(`/login?error=${encodeURIComponent(errorMessage(err))}`);
  }
});

webRouter.get('/register', (req, res) => {
  res.render('register', { error: req.query.error });
});

webRouter.post('/register', async (req, res) => {
  try {
    const input = registerSchema.parse(req.body);
    const { token } = await registerUser(input);
    setSessionCookie(res, token);
    res.redirect('/dashboard');
  } catch (err) {
    res.redirect(`/register?error=${encodeURIComponent(errorMessage(err))}`);
  }
});

webRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.redirect('/login');
});

webRouter.get('/dashboard', requireWebAuth, async (req, res) => {
  const [user, customers, products, orders, invoices, purchaseOrders] = await Promise.all([
    getCurrentUser(req.user!.userId),
    listCustomers(),
    listProducts(),
    listOrders(),
    listInvoices(),
    listPurchaseOrders(),
  ]);
  const outstandingInvoiceCents = invoices.reduce(
    (sum, invoice) =>
      sum + invoice.totalCents - invoice.payments.reduce((paid, payment) => paid + payment.amountCents, 0),
    0,
  );
  const salesStages = {
    draft: orders.filter((order) => order.status === 'DRAFT').length,
    ready: orders.filter((order) => order.status === 'CONFIRMED' && !order.invoice).length,
    invoiced: orders.filter((order) => Boolean(order.invoice)).length,
    cancelled: orders.filter((order) => order.status === 'CANCELLED').length,
  };
  const lowStockProducts = products.filter((product) => {
    const inventory = product.inventoryItem;
    return (inventory?.availableQty ?? 0) - (inventory?.reservedQty ?? 0) < 10;
  });
  res.render('dashboard', {
    user,
    asOf: new Date(),
    customerCount: customers.length,
    productCount: products.length,
    orderCount: orders.length,
    salesStages,
    pendingOrders: salesStages.draft + salesStages.ready,
    openPurchaseOrders: purchaseOrders.filter((order) => order.status === 'DRAFT' || order.status === 'ORDERED').length,
    outstandingInvoiceCents,
    paidRevenueCents: invoices
      .filter((invoice) => invoice.status === 'PAID')
      .reduce((sum, invoice) => sum + invoice.totalCents, 0),
    recentOrders: orders.slice(0, 6),
    recentPurchaseOrders: purchaseOrders.slice(0, 4),
    lowStockCount: lowStockProducts.length,
    lowStockProducts: lowStockProducts.slice(0, 5),
  });
});

webRouter.get('/analytics', requireWebAuth, async (req, res) => {
  res.render('analytics', { analytics: await getAnalytics(parseAnalyticsPeriod(req.query.days)) });
});

webRouter.get('/analytics/export.csv', requireWebAuth, async (req, res) => {
  const analytics = await getAnalytics(parseAnalyticsPeriod(req.query.days));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="erp-daily-analytics-${analytics.days}d.csv"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(analyticsCsv(analytics));
});

webRouter.get('/customers', requireWebAuth, async (_req, res) => {
  res.render('customers/list', { customers: await listCustomers() });
});

webRouter.get('/customers/new', requireWebAuth, (req, res) => {
  res.render('customers/new', { error: req.query.error });
});

webRouter.post('/customers', requireWebAuth, async (req, res) => {
  try {
    const input = createCustomerSchema.parse(req.body);
    await createCustomer(input);
    res.redirect('/customers');
  } catch (err) {
    res.redirect(`/customers/new?error=${encodeURIComponent(errorMessage(err))}`);
  }
});

webRouter.get('/customers/:id', requireWebAuth, async (req, res) => {
  res.render('customers/show', { customer: await getCustomer(req.params.id) });
});

webRouter.get('/products', requireWebAuth, async (_req, res) => {
  res.render('products/list', { products: await listProducts() });
});

webRouter.get('/orders', requireWebAuth, async (_req, res) => {
  res.render('orders/list', { orders: await listOrders() });
});

webRouter.get('/products/new', requireWebAuth, (req, res) => {
  res.render('products/new', { error: req.query.error });
});

webRouter.post('/products', requireWebAuth, async (req, res) => {
  try {
    const input = createProductSchema.parse({ ...req.body, priceCents: Number(req.body.priceCents) });
    await createProduct(input);
    res.redirect('/products');
  } catch (err) {
    res.redirect(`/products/new?error=${encodeURIComponent(errorMessage(err))}`);
  }
});

webRouter.get('/products/:id', requireWebAuth, async (req, res) => {
  res.render('products/show', { product: await getProduct(req.params.id), error: req.query.error });
});

webRouter.post('/products/:id/stock', requireWebAuth, async (req, res) => {
  try {
    await addStock(req.params.id, Number(req.body.quantity), req.body.note ? String(req.body.note) : undefined);
    res.redirect(`/products/${req.params.id}`);
  } catch (err) {
    res.redirect(`/products/${req.params.id}?error=${encodeURIComponent(errorMessage(err))}`);
  }
});

webRouter.get('/orders/new', requireWebAuth, async (req, res) => {
  const [customers, products] = await Promise.all([listCustomers(), listProducts()]);
  res.render('orders/new', { customers, products, error: req.query.error });
});

webRouter.post('/orders', requireWebAuth, async (req, res) => {
  try {
    const input = createOrderSchema.parse({
      customerId: req.body.customerId,
      items: parseOrderItems(req.body.items),
    });
    const order = await createOrder(input);
    res.redirect(`/orders/${order.id}`);
  } catch (err) {
    res.redirect(`/orders/new?error=${encodeURIComponent(errorMessage(err))}`);
  }
});

webRouter.get('/orders/:id', requireWebAuth, async (req, res) => {
  res.render('orders/show', { order: await getOrder(req.params.id), error: req.query.error });
});

webRouter.post('/orders/:id/confirm', requireWebAuth, async (req, res) => {
  try {
    await confirmOrder(req.params.id);
  } catch (err) {
    return res.redirect(`/orders/${req.params.id}?error=${encodeURIComponent(errorMessage(err))}`);
  }
  res.redirect(`/orders/${req.params.id}`);
});

webRouter.post('/orders/:id/cancel', requireWebAuth, async (req, res) => {
  try {
    await cancelOrder(req.params.id);
  } catch (err) {
    return res.redirect(`/orders/${req.params.id}?error=${encodeURIComponent(errorMessage(err))}`);
  }
  res.redirect(`/orders/${req.params.id}`);
});

webRouter.post('/orders/:id/invoice', requireWebAuth, async (req, res) => {
  try {
    const input = createInvoiceSchema.parse({ orderId: req.params.id });
    const invoice = await createInvoice(input);
    res.redirect(`/invoices/${invoice.id}`);
  } catch (err) {
    res.redirect(`/orders/${req.params.id}?error=${encodeURIComponent(errorMessage(err))}`);
  }
});

webRouter.get('/invoices', requireWebAuth, async (_req, res) => {
  res.render('invoices/list', { invoices: await listInvoices() });
});

webRouter.get('/invoices/:id', requireWebAuth, async (req, res) => {
  res.render('invoices/show', { invoice: await getInvoice(req.params.id), error: req.query.error });
});

webRouter.post('/invoices/:id/payments', requireWebAuth, async (req, res) => {
  try {
    const input = recordPaymentSchema.parse({
      amountCents: parseDollarsToCents(req.body.amountDollars),
      method: req.body.method || undefined,
    });
    await recordPayment(req.params.id, input);
  } catch (err) {
    return res.redirect(`/invoices/${req.params.id}?error=${encodeURIComponent(errorMessage(err))}`);
  }
  res.redirect(`/invoices/${req.params.id}`);
});

webRouter.get('/suppliers', requireWebAuth, async (_req, res) => {
  res.render('suppliers/list', { suppliers: await listSuppliers() });
});

webRouter.get('/suppliers/new', requireWebAuth, (req, res) => {
  res.render('suppliers/new', { error: req.query.error });
});

webRouter.post('/suppliers', requireWebAuth, async (req, res) => {
  try {
    const input = createSupplierSchema.parse(req.body);
    await createSupplier(input);
    res.redirect('/suppliers');
  } catch (err) {
    res.redirect(`/suppliers/new?error=${encodeURIComponent(errorMessage(err))}`);
  }
});

webRouter.get('/suppliers/:id', requireWebAuth, async (req, res) => {
  res.render('suppliers/show', { supplier: await getSupplier(req.params.id) });
});

webRouter.get('/purchase-orders', requireWebAuth, async (_req, res) => {
  res.render('purchase-orders/list', { purchaseOrders: await listPurchaseOrders() });
});

webRouter.get('/purchase-orders/new', requireWebAuth, async (req, res) => {
  const [suppliers, products] = await Promise.all([listSuppliers(), listProducts()]);
  res.render('purchase-orders/new', { suppliers, products, error: req.query.error });
});

webRouter.post('/purchase-orders', requireWebAuth, async (req, res) => {
  try {
    const input = createPurchaseOrderSchema.parse({
      supplierId: req.body.supplierId,
      items: parsePurchaseOrderItems(req.body.items),
    });
    const purchaseOrder = await createPurchaseOrder(input);
    res.redirect(`/purchase-orders/${purchaseOrder.id}`);
  } catch (err) {
    res.redirect(`/purchase-orders/new?error=${encodeURIComponent(errorMessage(err))}`);
  }
});

webRouter.get('/purchase-orders/:id', requireWebAuth, async (req, res) => {
  res.render('purchase-orders/show', {
    purchaseOrder: await getPurchaseOrder(req.params.id),
    error: req.query.error,
  });
});

webRouter.post('/purchase-orders/:id/submit', requireWebAuth, async (req, res) => {
  try {
    await submitPurchaseOrder(req.params.id);
  } catch (err) {
    return res.redirect(`/purchase-orders/${req.params.id}?error=${encodeURIComponent(errorMessage(err))}`);
  }
  res.redirect(`/purchase-orders/${req.params.id}`);
});

webRouter.post('/purchase-orders/:id/receive', requireWebAuth, async (req, res) => {
  try {
    await receivePurchaseOrder(req.params.id);
  } catch (err) {
    return res.redirect(`/purchase-orders/${req.params.id}?error=${encodeURIComponent(errorMessage(err))}`);
  }
  res.redirect(`/purchase-orders/${req.params.id}`);
});

webRouter.post('/purchase-orders/:id/cancel', requireWebAuth, async (req, res) => {
  try {
    await cancelPurchaseOrder(req.params.id);
  } catch (err) {
    return res.redirect(`/purchase-orders/${req.params.id}?error=${encodeURIComponent(errorMessage(err))}`);
  }
  res.redirect(`/purchase-orders/${req.params.id}`);
});
