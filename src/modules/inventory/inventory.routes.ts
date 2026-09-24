import { Router } from 'express';
import { asyncHandler } from '../../middleware/error.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { addStockSchema } from './inventory.types';
import { addStock, getInventoryForProduct, listInventoryMovements } from './inventory.service';

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

inventoryRouter.get(
  '/:productId/movements',
  asyncHandler(async (req, res) => {
    await getInventoryForProduct(req.params.productId);
    res.json(await listInventoryMovements(req.params.productId));
  }),
);

inventoryRouter.get(
  '/:productId',
  asyncHandler(async (req, res) => {
    res.json(await getInventoryForProduct(req.params.productId));
  }),
);

inventoryRouter.post(
  '/:productId/stock',
  asyncHandler(async (req, res) => {
    const input = addStockSchema.parse(req.body);
    res.status(200).json(await addStock(req.params.productId, input.quantity, input.note));
  }),
);
