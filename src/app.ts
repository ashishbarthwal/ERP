import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { customersRouter } from './modules/customers/customers.routes';
import { productsRouter } from './modules/products/products.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { ordersRouter } from './modules/orders/orders.routes';
import { invoicesRouter } from './modules/invoices/invoices.routes';
import { suppliersRouter } from './modules/suppliers/suppliers.routes';
import { purchasingRouter } from './modules/purchasing/purchasing.routes';
import { errorMiddleware } from './middleware/error.middleware';
import { webRouter, webViewsPath } from './web/web.routes';
import { attachOptionalUser } from './web/web.middleware';
import { csrfProtection } from './web/csrf.middleware';
import { prisma } from './lib/prisma';

export const createApp = () => {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const allowedOrigins = new Set((process.env.CORS_ORIGINS ?? '').split(',').map(origin => origin.trim()).filter(Boolean));
  // Browser clients are same-origin by default; explicitly allow trusted external API frontends.
  app.use('/api', cors({ origin: (origin, callback) => callback(null, Boolean(origin && allowedOrigins.has(origin))) }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.set('view engine', 'ejs');
  app.set('views', webViewsPath);

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  // Keep process liveness separate from database readiness for deployment health checks.
  app.get('/ready', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/inventory', inventoryRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/invoices', invoicesRouter);
  app.use('/api/suppliers', suppliersRouter);
  app.use('/api/purchase-orders', purchasingRouter);

  // Server-rendered web UI (Playwright's target): cookie-session auth, not the JWT
  // bearer-header auth the /api/* routes above use.
  app.use(attachOptionalUser, csrfProtection, webRouter);

  // Must be registered last: catches errors thrown/forwarded by every router above.
  app.use(errorMiddleware);

  return app;
};
