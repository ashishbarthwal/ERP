import { z } from 'zod';

export const createInvoiceSchema = z.object({
  orderId: z.string().min(1),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
  }, 'Enter a valid invoice due date').optional(),
});

export const recordPaymentSchema = z.object({
  amountCents: z.number().int().positive(),
  method: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
