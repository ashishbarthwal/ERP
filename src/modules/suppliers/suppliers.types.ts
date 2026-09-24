import { z } from 'zod';

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().optional(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

