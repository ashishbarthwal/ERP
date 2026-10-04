import { z } from 'zod';

export const createProductSchema = z.object({
  sku: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  priceCents: z.number().int().nonnegative(),
  reorderPoint: z.number().int().min(0).max(2_147_483_647).default(10),
});

export const updateReorderPointSchema = z.object({
  reorderPoint: z.number().int().min(0).max(2_147_483_647),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
