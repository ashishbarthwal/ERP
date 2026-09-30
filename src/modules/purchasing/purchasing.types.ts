import { z } from 'zod';

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().min(1),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive(),
        unitCostCents: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

export const idempotencyKeySchema = z.string().trim().min(1).max(128);

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

