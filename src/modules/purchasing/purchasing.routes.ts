import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/error.middleware';
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  receivePurchaseOrder,
  submitPurchaseOrder,
} from './purchasing.service';
import { createPurchaseOrderSchema } from './purchasing.types';

export const purchasingRouter = Router();
purchasingRouter.use(requireAuth);

purchasingRouter.get(
  '/',
  asyncHandler(async (_req, res) => res.json(await listPurchaseOrders())),
);

purchasingRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createPurchaseOrderSchema.parse(req.body);
    res.status(201).json(await createPurchaseOrder(input));
  }),
);

purchasingRouter.get(
  '/:id',
  asyncHandler(async (req, res) => res.json(await getPurchaseOrder(req.params.id))),
);

purchasingRouter.post(
  '/:id/submit',
  asyncHandler(async (req, res) => res.json(await submitPurchaseOrder(req.params.id))),
);

purchasingRouter.post(
  '/:id/receive',
  asyncHandler(async (req, res) => res.json(await receivePurchaseOrder(req.params.id))),
);

purchasingRouter.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => res.json(await cancelPurchaseOrder(req.params.id))),
);

