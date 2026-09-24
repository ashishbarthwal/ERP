import { Router } from 'express';
import { asyncHandler } from '../../middleware/error.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { createCustomerSchema } from './customers.types';
import { createCustomer, getCustomer, listCustomers } from './customers.service';

export const customersRouter = Router();
customersRouter.use(requireAuth);

customersRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await listCustomers());
  }),
);

customersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createCustomerSchema.parse(req.body);
    res.status(201).json(await createCustomer(input));
  }),
);

customersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getCustomer(req.params.id));
  }),
);
