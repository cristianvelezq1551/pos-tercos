-- Conteo físico ciclado: snapshot contado vs ledger por stockable.
-- La corrección del ledger NO vive acá: el service crea un
-- MANUAL_ADJUSTMENT en inventory_movements con source_type='stock_count'.

CREATE TABLE "stock_counts" (
  "id" TEXT NOT NULL,
  "entity_type" "StockableType" NOT NULL,
  "ingredient_id" TEXT,
  "product_id" TEXT,
  "subproduct_id" TEXT,
  "counted_qty" DECIMAL(14,4) NOT NULL,
  "ledger_qty" DECIMAL(14,4) NOT NULL,
  "difference" DECIMAL(14,4) NOT NULL,
  "user_id" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_ingredient_id_fkey"
  FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_subproduct_id_fkey"
  FOREIGN KEY ("subproduct_id") REFERENCES "subproducts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- XOR polimórfico: exactamente una entidad coherente con entity_type
-- (espejo de inventory_movements_entity_xor_check).
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_entity_xor_check"
  CHECK (
    (entity_type = 'INGREDIENT' AND ingredient_id IS NOT NULL AND product_id IS NULL AND subproduct_id IS NULL)
    OR (entity_type = 'PRODUCT' AND product_id IS NOT NULL AND ingredient_id IS NULL AND subproduct_id IS NULL)
    OR (entity_type = 'SUBPRODUCT' AND subproduct_id IS NOT NULL AND ingredient_id IS NULL AND product_id IS NULL)
  );

-- counted_qty físico nunca es negativo (el ledger sí puede estarlo por bugs).
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_counted_nonneg_check"
  CHECK (counted_qty >= 0);

CREATE INDEX "stock_counts_entity_type_ingredient_id_created_at_idx"
  ON "stock_counts"("entity_type", "ingredient_id", "created_at" DESC);
CREATE INDEX "stock_counts_entity_type_product_id_created_at_idx"
  ON "stock_counts"("entity_type", "product_id", "created_at" DESC);
CREATE INDEX "stock_counts_entity_type_subproduct_id_created_at_idx"
  ON "stock_counts"("entity_type", "subproduct_id", "created_at" DESC);
