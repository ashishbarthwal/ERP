ALTER TABLE "InventoryItem"
ADD CONSTRAINT "InventoryItem_quantities_valid"
CHECK ("availableQty" >= 0 AND "reservedQty" >= 0 AND "reservedQty" <= "availableQty");

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_amountCents_positive"
CHECK ("amountCents" > 0);

ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_totalCents_nonnegative"
CHECK ("totalCents" >= 0);

ALTER TABLE "OrderItem"
ADD CONSTRAINT "OrderItem_quantity_and_price_valid"
CHECK ("quantity" > 0 AND "unitPriceCents" >= 0);

ALTER TABLE "PurchaseOrderItem"
ADD CONSTRAINT "PurchaseOrderItem_quantity_and_cost_valid"
CHECK ("quantity" > 0 AND "unitCostCents" >= 0);

ALTER TABLE "Product"
ADD CONSTRAINT "Product_priceCents_nonnegative"
CHECK ("priceCents" >= 0);
