-- CreateEnum
CREATE TYPE "PurchaseSuggestionStatus" AS ENUM ('PENDING', 'EVALUATED', 'ACCEPTED', 'REJECTED', 'STALE');

-- CreateTable
CREATE TABLE "purchase_suggestions" (
    "id" TEXT NOT NULL,
    "entity_type" "StockableType" NOT NULL,
    "ingredient_id" TEXT,
    "product_id" TEXT,
    "current_stock" DECIMAL(14,4) NOT NULL,
    "threshold_min" DECIMAL(14,4) NOT NULL,
    "unit_purchase" TEXT NOT NULL,
    "suggested_qty" DECIMAL(14,4) NOT NULL,
    "est_unit_cost" DECIMAL(14,4),
    "est_total" DECIMAL(14,2),
    "llm_rationale" TEXT,
    "llm_model" TEXT,
    "llm_evaluated_at" TIMESTAMP(3),
    "status" "PurchaseSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_suggestions_status_created_at_idx" ON "purchase_suggestions"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "purchase_suggestions_entity_type_ingredient_id_product_id_idx" ON "purchase_suggestions"("entity_type", "ingredient_id", "product_id");

-- AddForeignKey
ALTER TABLE "purchase_suggestions" ADD CONSTRAINT "purchase_suggestions_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_suggestions" ADD CONSTRAINT "purchase_suggestions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_suggestions" ADD CONSTRAINT "purchase_suggestions_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CHECK polimórfico: exactamente uno de (ingredient_id, product_id)
-- coherente con entity_type. Espeja inventory_movements.
ALTER TABLE "purchase_suggestions" ADD CONSTRAINT "chk_purchase_sugg_polymorphic"
  CHECK (
    (entity_type = 'INGREDIENT' AND ingredient_id IS NOT NULL AND product_id IS NULL)
    OR
    (entity_type = 'PRODUCT' AND product_id IS NOT NULL AND ingredient_id IS NULL)
  );

-- suggested_qty siempre > 0 (no tiene sentido sugerir comprar 0).
ALTER TABLE "purchase_suggestions" ADD CONSTRAINT "chk_purchase_sugg_qty_positive"
  CHECK (suggested_qty > 0);
