import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/error.middleware';
import { createSupplier, getSupplier, listSuppliers } from './suppliers.service';
import { createSupplierSchema } from './suppliers.types';

export const suppliersRouter = Router();
suppliersRouter.use(requireAuth);

suppliersRouter.get(
  '/',
  asyncHandler(async (_req, res) => res.json(await listSuppliers())),
);

suppliersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createSupplierSchema.parse(req.body);
    res.status(201).json(await createSupplier(input));
  }),
);

suppliersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => res.json(await getSupplier(req.params.id))),
);

