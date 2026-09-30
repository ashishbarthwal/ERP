import { z } from 'zod';

export const addStockSchema = z.object({
  quantity: z.number().int().positive(),
  note: z.string().trim().max(160).optional(),
});

export const stockIdempotencyKeySchema = z.string().min(8).max(200).regex(/^[A-Za-z0-9._~-]+$/);

export type AddStockInput = z.infer<typeof addStockSchema>;

export type InventoryMovementType =
  | 'MANUAL_ADDITION'
  | 'PURCHASE_RECEIPT'
  | 'ORDER_RESERVATION'
  | 'ORDER_RELEASE'
  | 'SALE_CONSUMPTION';

export interface InventoryMovementContext {
  type: InventoryMovementType;
  referenceType?: 'ORDER' | 'PURCHASE_ORDER' | 'MANUAL';
  referenceId?: string;
  note?: string;
  idempotencyKeyHash?: string;
}
