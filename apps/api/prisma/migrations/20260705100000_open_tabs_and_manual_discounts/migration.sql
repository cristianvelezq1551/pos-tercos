-- Bloque de ventas 2026-07 (#3 cuentas abiertas + #5b descuento manual).
--
-- #3 Cuentas abiertas: una venta COUNTER puede quedar abierta indefinidamente
-- (cliente conocido) en PENDIENTE_PAGO. `is_open_tab=true` la exime del sweep
-- de cobros abandonados. La comanda sale por TANDAS: `sent_to_kitchen_qty`
-- registra cuántas unidades de cada línea ya se enviaron a cocina; la comanda
-- incremental imprime solo `quantity - sent_to_kitchen_qty`.
--
-- #5b Descuento manual: por línea y/o sobre el total, en monto fijo o
-- porcentaje. EXCLUYENTE con promociones (si hay descuento manual, la venta
-- ignora promos). `discount_total` de la venta = descuentos de línea +
-- `order_discount_amount` (mantiene el CHECK sales_total_coherent).

-- Cuentas abiertas
ALTER TABLE "sales" ADD COLUMN "is_open_tab" BOOLEAN NOT NULL DEFAULT false;

-- Comanda incremental por ítem
ALTER TABLE "sale_items" ADD COLUMN "sent_to_kitchen_qty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sale_items" ADD COLUMN "sent_to_kitchen_at" TIMESTAMP(3);

ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sent_qty_nonneg"
  CHECK ("sent_to_kitchen_qty" >= 0);

-- Descuento manual sobre el TOTAL
ALTER TABLE "sales" ADD COLUMN "discount_reason" TEXT;
ALTER TABLE "sales" ADD COLUMN "order_discount_kind" TEXT;
ALTER TABLE "sales" ADD COLUMN "order_discount_value" DECIMAL(14,2);
ALTER TABLE "sales" ADD COLUMN "order_discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "sales" ADD CONSTRAINT "sales_order_discount_kind_valid"
  CHECK ("order_discount_kind" IS NULL OR "order_discount_kind" IN ('FIXED', 'PERCENT'));
ALTER TABLE "sales" ADD CONSTRAINT "sales_order_discount_coherent"
  CHECK (("order_discount_kind" IS NULL) = ("order_discount_value" IS NULL));
ALTER TABLE "sales" ADD CONSTRAINT "sales_order_discount_amount_nonneg"
  CHECK ("order_discount_amount" >= 0);

-- Descuento manual POR LÍNEA (el monto resultante vive en line_discount, igual
-- que las promos; kind+value distinguen manual de promo y permiten recomputar)
ALTER TABLE "sale_items" ADD COLUMN "manual_discount_kind" TEXT;
ALTER TABLE "sale_items" ADD COLUMN "manual_discount_value" DECIMAL(14,2);

ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_manual_discount_kind_valid"
  CHECK ("manual_discount_kind" IS NULL OR "manual_discount_kind" IN ('FIXED', 'PERCENT'));
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_manual_discount_coherent"
  CHECK (("manual_discount_kind" IS NULL) = ("manual_discount_value" IS NULL));
