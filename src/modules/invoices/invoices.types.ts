import { z } from 'zod';

export const createInvoiceSchema = z.object({
  orderId: z.string().min(1),
});

export const recordPaymentSchema = z.object({
  amountCents: z.number().int().positive(),
  method: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
