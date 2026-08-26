-- Lista de faltantes armada A MANO por el admin, complemento de las
-- sugerencias automáticas: se arma con varios ítems, se imprime (general o
-- partida por proveedor) y queda como historial de qué se pidió y quién.

CREATE TYPE "PurchaseListStatus" AS ENUM ('DRAFT', 'CLOSED');

CREATE TABLE "purchase_lists" (
    "id" TEXT NOT NULL,
    "status" "PurchaseListStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "notes" TEXT,
    "ai_rationale" TEXT,
    "ai_model" TEXT,
    "ai_evaluated_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "closed_by" TEXT,

    CONSTRAINT "purchase_lists_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_list_items" (
    "id" TEXT NOT NULL,
    "list_id" TEXT NOT NULL,
    "entity_type" "StockableType" NOT NULL,
    "ingredient_id" TEXT,
    "product_id" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit_purchase" TEXT NOT NULL,
    "unit_stock" TEXT NOT NULL,
    "conversion_factor" DECIMAL(14,6) NOT NULL,
    "current_stock" DECIMAL(14,4) NOT NULL,
    "threshold_min" DECIMAL(14,4) NOT NULL,
    "est_unit_cost" DECIMAL(14,4),
    "est_total" DECIMAL(14,2),
    "supplier_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_list_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "purchase_lists_status_created_at_idx" ON "purchase_lists"("status", "created_at" DESC);
CREATE INDEX "purchase_list_items_list_id_idx" ON "purchase_list_items"("list_id");

-- Un mismo insumo no se repite dentro de una lista: dos renglones del mismo
-- pan hacen que quien compra pida el doble sin darse cuenta.
CREATE UNIQUE INDEX "purchase_list_items_list_id_entity_type_ingredient_id_prod_key"
  ON "purchase_list_items"("list_id", "entity_type", "ingredient_id", "product_id");

ALTER TABLE "purchase_lists" ADD CONSTRAINT "purchase_lists_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_lists" ADD CONSTRAINT "purchase_lists_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_list_items" ADD CONSTRAINT "purchase_list_items_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "purchase_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_list_items" ADD CONSTRAINT "purchase_list_items_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_list_items" ADD CONSTRAINT "purchase_list_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_list_items" ADD CONSTRAINT "purchase_list_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Polimórfico: exactamente uno de (ingrediente, producto), coherente con el
-- tipo. Los SUBPRODUCTOS no entran: se producen, no se compran (la misma
-- razón por la que reventaban el escaneo de sugerencias).
ALTER TABLE "purchase_list_items" ADD CONSTRAINT "chk_purchase_list_item_polymorphic"
  CHECK (
    (entity_type = 'INGREDIENT' AND ingredient_id IS NOT NULL AND product_id IS NULL)
    OR
    (entity_type = 'PRODUCT' AND product_id IS NOT NULL AND ingredient_id IS NULL)
  );

-- Pedir 0 (o menos) no es pedir.
ALTER TABLE "purchase_list_items" ADD CONSTRAINT "chk_purchase_list_item_qty_positive"
  CHECK (quantity > 0);
