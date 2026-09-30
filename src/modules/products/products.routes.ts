import { Router } from 'express';
import { asyncHandler } from '../../middleware/error.middleware';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { createProductSchema } from './products.types';
import { createProduct, getProduct, listProducts } from './products.service';

export const productsRouter = Router();
productsRouter.use(requireAuth);

productsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await listProducts());
  }),
);

productsRouter.post(
  '/',
  requirePermission('products.write'),
  asyncHandler(async (req, res) => {
    const input = createProductSchema.parse(req.body);
    res.status(201).json(await createProduct(input, req.user!.userId));
  }),
);

productsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getProduct(req.params.id));
  }),
);
