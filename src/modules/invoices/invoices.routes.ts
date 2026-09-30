import { Router } from 'express';
import { asyncHandler } from '../../middleware/error.middleware';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { createInvoiceSchema, recordPaymentSchema } from './invoices.types';
import { createInvoice, getInvoice, listInvoices, recordPayment } from './invoices.service';

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth);

invoicesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await listInvoices());
  }),
);

invoicesRouter.post(
  '/',
  requirePermission('invoices.write'),
  asyncHandler(async (req, res) => {
    const input = createInvoiceSchema.parse(req.body);
    res.status(201).json(await createInvoice(input, req.user!.userId));
  }),
);

invoicesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getInvoice(req.params.id));
  }),
);

invoicesRouter.post(
  '/:id/payments',
  requirePermission('payments.write'),
  asyncHandler(async (req, res) => {
    const input = recordPaymentSchema.parse(req.body);
    res.status(200).json(await recordPayment(req.params.id, input, req.user!.userId));
  }),
);
