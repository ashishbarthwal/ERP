ALTER TABLE "Payment" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "Payment_invoiceId_idempotencyKey_key"
ON "Payment"("invoiceId", "idempotencyKey");
