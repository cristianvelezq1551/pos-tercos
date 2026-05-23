-- Receta por variante: una recipe_edge puede colgar de un product_size
-- (aditiva sobre la receta base del producto). Ej. la proteína de "Papas Terco".
ALTER TABLE "recipe_edges" ADD COLUMN "parent_size_id" TEXT;

ALTER TABLE "recipe_edges"
  ADD CONSTRAINT "recipe_edges_parent_size_id_fkey"
  FOREIGN KEY ("parent_size_id") REFERENCES "product_sizes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "recipe_edges_parent_size_id_idx" ON "recipe_edges"("parent_size_id");

-- Padre = exactamente uno de (producto, subproducto, variante).
ALTER TABLE "recipe_edges" DROP CONSTRAINT "recipe_edges_one_parent_check";
ALTER TABLE "recipe_edges"
  ADD CONSTRAINT "recipe_edges_one_parent_check"
  CHECK (
    ("parent_product_id" IS NOT NULL)::int
    + ("parent_subproduct_id" IS NOT NULL)::int
    + ("parent_size_id" IS NOT NULL)::int = 1
  );
