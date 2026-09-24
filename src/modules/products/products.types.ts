import { z } from 'zod';

export const createProductSchema = z.object({
  sku: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  priceCents: z.number().int().nonnegative(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
