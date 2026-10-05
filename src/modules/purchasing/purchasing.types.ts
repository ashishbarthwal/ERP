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

export const receivePurchaseOrderSchema = z.object({
  items: z.array(z.object({
    purchaseOrderItemId: z.string().min(1),
    quantity: z.number().int().positive(),
  })).min(1).max(50).refine(
    (items) => items.length === new Set(items.map((item) => item.purchaseOrderItemId)).size,
    'A receipt cannot contain the same purchase order line twice',
  ),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type ReceivePurchaseOrderInput = z.infer<typeof receivePurchaseOrderSchema>;

