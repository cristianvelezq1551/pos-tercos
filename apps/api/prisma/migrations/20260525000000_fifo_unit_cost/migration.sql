-- FIFO / COGS real: costo unitario por movimiento de inventario.
-- unit_cost está en la MISMA unidad que delta (unidad de stock/receta).
-- Solo se llena en entradas (PURCHASE / INITIAL / ajuste+). En consumos queda
-- NULL: su costo lo resuelve el motor FIFO al consumir lotes.
ALTER TABLE "inventory_movements" ADD COLUMN "unit_cost" DECIMAL(14,4);

-- Backfill best-effort de compras históricas desde invoice_items.
-- Costo por unidad de stock = (cantidad_compra * precio_unit_compra) / delta_stock.
-- La tabla es insert-only por trigger → se suspende SOLO durante el backfill.
ALTER TABLE "inventory_movements" DISABLE TRIGGER "inventory_movements_insert_only";

UPDATE "inventory_movements" m
SET "unit_cost" = ROUND((ii."quantity" * ii."unit_price") / m."delta", 4)
FROM "invoice_items" ii
WHERE m."type" = 'PURCHASE'
  AND m."source_type" = 'invoice'
  AND m."source_id" = ii."invoice_id"
  AND m."entity_type" = ii."entity_type"
  AND m."delta" <> 0
  AND m."unit_cost" IS NULL
  AND (
    (m."entity_type" = 'INGREDIENT' AND m."ingredient_id" = ii."ingredient_id") OR
    (m."entity_type" = 'PRODUCT' AND m."product_id" = ii."product_id")
  );

ALTER TABLE "inventory_movements" ENABLE TRIGGER "inventory_movements_insert_only";

-- Nota: INITIAL y ajustes manuales positivos históricos quedan con unit_cost NULL
-- (no tienen fuente de costo). El motor FIFO los trata como "lote sin costo
-- conocido" y los reportes lo señalan, en vez de asumir $0.
