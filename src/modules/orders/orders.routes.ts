import { Router } from 'express';
import { asyncHandler } from '../../middleware/error.middleware';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { createOrderSchema } from './orders.types';
import { cancelOrder, confirmOrder, createOrder, getOrder, listOrders } from './orders.service';

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

ordersRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await listOrders());
  }),
);

ordersRouter.post(
  '/',
  requirePermission('orders.write'),
  asyncHandler(async (req, res) => {
    const input = createOrderSchema.parse(req.body);
    res.status(201).json(await createOrder(input));
  }),
);

ordersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getOrder(req.params.id));
  }),
);

ordersRouter.post(
  '/:id/confirm',
  requirePermission('orders.write'),
  asyncHandler(async (req, res) => {
    res.json(await confirmOrder(req.params.id));
  }),
);

ordersRouter.post(
  '/:id/cancel',
  requirePermission('orders.write'),
  asyncHandler(async (req, res) => {
    res.json(await cancelOrder(req.params.id));
  }),
);
