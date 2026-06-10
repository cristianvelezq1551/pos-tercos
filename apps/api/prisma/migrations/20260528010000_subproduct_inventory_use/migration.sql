-- ============================================================================
-- Inventario de SUBPRODUCTOS — paso 2: usar los valores nuevos.
-- ============================================================================
--
-- - inventory_movements gana subproduct_id (xor con ingredient_id/product_id)
-- - CHECK polimórfico actualizado para 3 entidades
-- - subproducts gana threshold_min (umbral para producir más)
--
-- Conventions:
--  * Producir N unidades de subproducto crea N+receta movements del tipo
--    PRODUCTION: uno positivo en el subproducto (+N), y uno negativo por
--    cada insumo consumido. Todos comparten source_type='production' y un
--    mismo source_id (UUID de la "tanda").
--  * Las ventas crean movements SALE del subproducto (delta<0), espejo del
--    patrón actual de ingredients. La cadena se rompe ahí — no se expande
--    recursivo a los insumos del subproducto.
-- ----------------------------------------------------------------------------

-- 1. inventory_movements: nueva columna subproduct_id + FK + index.
ALTER TABLE "inventory_movements"
  ADD COLUMN "subproduct_id" TEXT;

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_subproduct_id_fkey"
  FOREIGN KEY ("subproduct_id") REFERENCES "subproducts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "inventory_movements_subproduct_idx"
  ON "inventory_movements" ("subproduct_id");

-- 2. CHECK polimórfico actualizado para 3 entidades.
ALTER TABLE "inventory_movements"
  DROP CONSTRAINT IF EXISTS "inventory_movements_entity_xor_check";

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_entity_xor_check"
  CHECK (
    (entity_type = 'INGREDIENT' AND ingredient_id IS NOT NULL AND product_id IS NULL AND subproduct_id IS NULL)
    OR (entity_type = 'PRODUCT' AND product_id IS NOT NULL AND ingredient_id IS NULL AND subproduct_id IS NULL)
    OR (entity_type = 'SUBPRODUCT' AND subproduct_id IS NOT NULL AND ingredient_id IS NULL AND product_id IS NULL)
  );

-- 3. subproducts gana threshold_min (para alertas de "producir más").
ALTER TABLE "subproducts"
  ADD COLUMN "threshold_min" DECIMAL(14, 4) NOT NULL DEFAULT 0;

ALTER TABLE "subproducts"
  ADD CONSTRAINT "chk_subproduct_threshold_nonneg"
  CHECK ("threshold_min" >= 0);
