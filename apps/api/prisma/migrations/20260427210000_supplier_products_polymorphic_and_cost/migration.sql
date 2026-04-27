-- Refactor supplier_products a polimórfico (soporta Insumo + Producto direct-resale)
-- + agrega last_unit_cost a Product

-- 1. Agrego entity_type a supplier_products con default INGREDIENT (todas las
--    rows existentes son de insumos)
ALTER TABLE "supplier_products"
  ADD COLUMN "entity_type" "StockableType" NOT NULL DEFAULT 'INGREDIENT',
  ADD COLUMN "product_id" TEXT,
  ALTER COLUMN "ingredient_id" DROP NOT NULL;

ALTER TABLE "supplier_products"
  ALTER COLUMN "entity_type" DROP DEFAULT;

-- 2. Index + FK para product_id
CREATE INDEX "supplier_products_product_id_idx" ON "supplier_products"("product_id");

ALTER TABLE "supplier_products"
  ADD CONSTRAINT "supplier_products_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Unique parcial: (supplier, product) cuando product no es null
CREATE UNIQUE INDEX "supplier_products_supplier_id_product_id_key"
  ON "supplier_products"("supplier_id", "product_id");

-- 4. CHECK XOR
ALTER TABLE "supplier_products"
  ADD CONSTRAINT "supplier_products_entity_xor_check"
  CHECK (
    (entity_type = 'INGREDIENT' AND ingredient_id IS NOT NULL AND product_id IS NULL)
    OR (entity_type = 'PRODUCT' AND product_id IS NOT NULL AND ingredient_id IS NULL)
  );

-- 5. Nuevos campos en Product para tracking de costo
ALTER TABLE "products"
  ADD COLUMN "last_unit_cost" DECIMAL(14,4),
  ADD COLUMN "last_unit_cost_date" TIMESTAMP(3);
