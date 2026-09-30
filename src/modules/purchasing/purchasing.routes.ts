import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/error.middleware';
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  receivePurchaseOrder,
  submitPurchaseOrder,
} from './purchasing.service';
import { createPurchaseOrderSchema, idempotencyKeySchema } from './purchasing.types';

export const purchasingRouter = Router();
purchasingRouter.use(requireAuth);

purchasingRouter.get(
  '/',
  asyncHandler(async (_req, res) => res.json(await listPurchaseOrders())),
);

purchasingRouter.post(
  '/',
  requirePermission('purchases.write'),
  asyncHandler(async (req, res) => {
    const input = createPurchaseOrderSchema.parse(req.body);
    res.status(201).json(await createPurchaseOrder(input, req.user!.userId));
  }),
);

purchasingRouter.get(
  '/:id',
  asyncHandler(async (req, res) => res.json(await getPurchaseOrder(req.params.id))),
);

purchasingRouter.post(
  '/:id/submit',
  requirePermission('purchases.write'),
  asyncHandler(async (req, res) => res.json(await submitPurchaseOrder(req.params.id, req.user!.userId))),
);

purchasingRouter.post(
  '/:id/receive',
  requirePermission('purchases.receive'),
  asyncHandler(async (req, res) => {
    const rawKey = req.get('Idempotency-Key') ?? req.body?.idempotencyKey;
    const key = rawKey === undefined ? undefined : idempotencyKeySchema.parse(rawKey);
    res.json(await receivePurchaseOrder(req.params.id, req.user!.userId, key));
  }),
);

purchasingRouter.post(
  '/:id/cancel',
  requirePermission('purchases.write'),
  asyncHandler(async (req, res) => res.json(await cancelPurchaseOrder(req.params.id, req.user!.userId))),
);

