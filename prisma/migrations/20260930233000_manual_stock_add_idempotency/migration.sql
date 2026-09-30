ALTER TABLE "InventoryMovement" ADD COLUMN "idempotencyKeyHash" TEXT;
CREATE UNIQUE INDEX "InventoryMovement_idempotencyKeyHash_key" ON "InventoryMovement"("idempotencyKeyHash");