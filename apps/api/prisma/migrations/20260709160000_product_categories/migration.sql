-- Catálogo curado de categorías de producto (evita duplicados por tipeo).
CREATE TABLE "product_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_categories_name_key" ON "product_categories"("name");

-- Backfill: sembrar la tabla con las categorías ya usadas por productos.
INSERT INTO "product_categories" ("id", "name", "sort_order")
SELECT gen_random_uuid()::text,
       c.category,
       (row_number() OVER (ORDER BY lower(c.category)) - 1)::int
FROM (
  SELECT DISTINCT category
  FROM "products"
  WHERE category IS NOT NULL AND category <> ''
) c;
