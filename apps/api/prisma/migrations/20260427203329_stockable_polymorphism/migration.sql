-- CreateEnum
CREATE TYPE "StockableType" AS ENUM ('INGREDIENT', 'PRODUCT');

-- AlterTable inventory_movements: agrego entity_type con default INGREDIENT
-- (todos los movements existentes son de insumos), después remuevo el default
-- para forzar especificación explícita en nuevos rows.
ALTER TABLE "inventory_movements"
  ADD COLUMN "entity_type" "StockableType" NOT NULL DEFAULT 'INGREDIENT',
  ADD COLUMN "product_id" TEXT,
  ALTER COLUMN "ingredient_id" DROP NOT NULL;

ALTER TABLE "inventory_movements"
  ALTER COLUMN "entity_type" DROP DEFAULT;

-- AlterTable invoice_items
ALTER TABLE "invoice_items"
  ADD COLUMN "entity_type" "StockableType",
  ADD COLUMN "product_id" TEXT;

-- Backfill: invoice_items existentes con ingredient_id no nulo → entity_type INGREDIENT
UPDATE "invoice_items"
SET "entity_type" = 'INGREDIENT'
WHERE "ingredient_id" IS NOT NULL;

-- AlterTable products: campos para direct-resale
ALTER TABLE "products"
  ADD COLUMN "conversion_factor" DECIMAL(14,6),
  ADD COLUMN "direct_resale" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "threshold_min" DECIMAL(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN "unit_purchase" TEXT,
  ADD COLUMN "unit_stock" TEXT;

-- Indexes
CREATE INDEX "inventory_movements_product_id_created_at_idx"
  ON "inventory_movements"("product_id", "created_at" DESC);

CREATE INDEX "inventory_movements_entity_type_created_at_idx"
  ON "inventory_movements"("entity_type", "created_at" DESC);

CREATE INDEX "invoice_items_product_id_idx" ON "invoice_items"("product_id");

CREATE INDEX "products_direct_resale_is_active_idx"
  ON "products"("direct_resale", "is_active");

-- Foreign keys
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoice_items"
  ADD CONSTRAINT "invoice_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- CHECK constraints
-- ============================================================

ALTER TABLE "inventory_movements"
ADD CONSTRAINT "inventory_movements_entity_xor_check"
CHECK (
  (entity_type = 'INGREDIENT' AND ingredient_id IS NOT NULL AND product_id IS NULL)
  OR (entity_type = 'PRODUCT' AND product_id IS NOT NULL AND ingredient_id IS NULL)
);

ALTER TABLE "invoice_items"
ADD CONSTRAINT "invoice_items_entity_consistency_check"
CHECK (
  (entity_type IS NULL AND ingredient_id IS NULL AND product_id IS NULL)
  OR (entity_type = 'INGREDIENT' AND ingredient_id IS NOT NULL AND product_id IS NULL)
  OR (entity_type = 'PRODUCT' AND product_id IS NOT NULL AND ingredient_id IS NULL)
);

ALTER TABLE "products"
ADD CONSTRAINT "products_direct_resale_units_check"
CHECK (
  direct_resale = false
  OR (
    unit_purchase IS NOT NULL
    AND unit_stock IS NOT NULL
    AND conversion_factor IS NOT NULL
    AND conversion_factor > 0
  )
);

ALTER TABLE "products"
ADD CONSTRAINT "products_threshold_min_nonneg_check"
CHECK (threshold_min >= 0);
