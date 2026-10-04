ALTER TABLE "PurchaseOrderItem"
ADD COLUMN "receivedQty" INTEGER NOT NULL DEFAULT 0;

UPDATE "PurchaseOrderItem" AS item
SET "receivedQty" = item.quantity
FROM "PurchaseOrder" AS purchase
WHERE purchase.id = item."purchaseOrderId"
  AND purchase.status = 'RECEIVED';

ALTER TABLE "PurchaseOrderItem"
ADD CONSTRAINT "PurchaseOrderItem_receivedQty_check"
CHECK ("receivedQty" >= 0 AND "receivedQty" <= quantity);

CREATE TABLE "PurchaseReceipt" (
  id TEXT NOT NULL PRIMARY KEY,
  "purchaseOrderId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseReceipt_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PurchaseReceiptItem" (
  id TEXT NOT NULL PRIMARY KEY,
  "receiptId" TEXT NOT NULL,
  "purchaseOrderItemId" TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  CONSTRAINT "PurchaseReceiptItem_receiptId_fkey"
    FOREIGN KEY ("receiptId") REFERENCES "PurchaseReceipt"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReceiptItem_purchaseOrderItemId_fkey"
    FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReceiptItem_quantity_check" CHECK (quantity > 0)
);

CREATE UNIQUE INDEX "PurchaseReceipt_purchaseOrderId_idempotencyKey_key"
ON "PurchaseReceipt"("purchaseOrderId", "idempotencyKey");
CREATE INDEX "PurchaseReceipt_purchaseOrderId_createdAt_idx"
ON "PurchaseReceipt"("purchaseOrderId", "createdAt");
CREATE INDEX "PurchaseReceipt_createdAt_idx" ON "PurchaseReceipt"("createdAt");
CREATE UNIQUE INDEX "PurchaseReceiptItem_receiptId_purchaseOrderItemId_key"
ON "PurchaseReceiptItem"("receiptId", "purchaseOrderItemId");

-- Preserve one historical receipt per order so old completed-order retry keys
-- remain recognizable after moving to receipt batches.
INSERT INTO "PurchaseReceipt" (id, "purchaseOrderId", "idempotencyKey", "requestHash", "createdAt")
SELECT 'legacy_' || purchase.id,
       purchase.id,
       COALESCE(purchase."receiptIdempotencyKey", 'legacy:' || purchase.id),
       'legacy',
       COALESCE(purchase."receivedAt", purchase."orderedAt", purchase."createdAt")
FROM "PurchaseOrder" AS purchase
WHERE purchase.status = 'RECEIVED';

INSERT INTO "PurchaseReceiptItem" (id, "receiptId", "purchaseOrderItemId", quantity)
SELECT 'legacy_line_' || item.id, 'legacy_' || item."purchaseOrderId", item.id, item.quantity
FROM "PurchaseOrderItem" AS item
JOIN "PurchaseOrder" AS purchase ON purchase.id = item."purchaseOrderId"
WHERE purchase.status = 'RECEIVED';

-- Keep a rollback to the previous application revision reconcilable. Older
-- application code receives a whole purchase order without writing receipt rows.
CREATE FUNCTION sync_legacy_purchase_order_receipt() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'RECEIVED' OR NEW.status <> 'RECEIVED' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM "PurchaseReceipt" WHERE "purchaseOrderId" = NEW.id) THEN
    RETURN NEW;
  END IF;

  UPDATE "PurchaseOrderItem"
  SET "receivedQty" = quantity
  WHERE "purchaseOrderId" = NEW.id;

  INSERT INTO "PurchaseReceipt" (id, "purchaseOrderId", "idempotencyKey", "requestHash", "createdAt")
  VALUES (
    'legacy_trigger_' || NEW.id,
    NEW.id,
    COALESCE(NEW."receiptIdempotencyKey", 'legacy:' || NEW.id),
    'legacy',
    COALESCE(NEW."receivedAt", CURRENT_TIMESTAMP)
  );

  INSERT INTO "PurchaseReceiptItem" (id, "receiptId", "purchaseOrderItemId", quantity)
  SELECT 'legacy_trigger_line_' || item.id,
         'legacy_trigger_' || NEW.id,
         item.id,
         item.quantity
  FROM "PurchaseOrderItem" AS item
  WHERE item."purchaseOrderId" = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PurchaseOrder_legacy_receipt_sync"
AFTER UPDATE OF status ON "PurchaseOrder"
FOR EACH ROW
EXECUTE FUNCTION sync_legacy_purchase_order_receipt();
