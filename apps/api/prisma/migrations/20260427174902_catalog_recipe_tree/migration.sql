-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "base_price" DECIMAL(12,2) NOT NULL,
    "category" TEXT,
    "image_url" TEXT,
    "modifiers_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_combo" BOOLEAN NOT NULL DEFAULT false,
    "combo_price" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_sizes" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_modifier" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_sizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_modifiers" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_delta" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "recipe_delta" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "product_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combo_components" (
    "id" TEXT NOT NULL,
    "combo_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "combo_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subproducts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "yield" DECIMAL(10,4) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'unidad',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subproducts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit_purchase" TEXT NOT NULL,
    "unit_recipe" TEXT NOT NULL,
    "conversion_factor" DECIMAL(14,6) NOT NULL,
    "threshold_min" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_edges" (
    "id" TEXT NOT NULL,
    "parent_product_id" TEXT,
    "parent_subproduct_id" TEXT,
    "child_ingredient_id" TEXT,
    "child_subproduct_id" TEXT,
    "quantity_neta" DECIMAL(14,4) NOT NULL,
    "merma_pct" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_edges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_category_is_active_idx" ON "products"("category", "is_active");

-- CreateIndex
CREATE INDEX "products_is_active_idx" ON "products"("is_active");

-- CreateIndex
CREATE INDEX "product_sizes_product_id_idx" ON "product_sizes"("product_id");

-- CreateIndex
CREATE INDEX "product_modifiers_product_id_idx" ON "product_modifiers"("product_id");

-- CreateIndex
CREATE INDEX "combo_components_combo_id_idx" ON "combo_components"("combo_id");

-- CreateIndex
CREATE INDEX "combo_components_product_id_idx" ON "combo_components"("product_id");

-- CreateIndex
CREATE INDEX "subproducts_is_active_idx" ON "subproducts"("is_active");

-- CreateIndex
CREATE INDEX "ingredients_is_active_idx" ON "ingredients"("is_active");

-- CreateIndex
CREATE INDEX "recipe_edges_parent_product_id_idx" ON "recipe_edges"("parent_product_id");

-- CreateIndex
CREATE INDEX "recipe_edges_parent_subproduct_id_idx" ON "recipe_edges"("parent_subproduct_id");

-- CreateIndex
CREATE INDEX "recipe_edges_child_ingredient_id_idx" ON "recipe_edges"("child_ingredient_id");

-- CreateIndex
CREATE INDEX "recipe_edges_child_subproduct_id_idx" ON "recipe_edges"("child_subproduct_id");

-- AddForeignKey
ALTER TABLE "product_sizes" ADD CONSTRAINT "product_sizes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_modifiers" ADD CONSTRAINT "product_modifiers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_components" ADD CONSTRAINT "combo_components_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_components" ADD CONSTRAINT "combo_components_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_edges" ADD CONSTRAINT "recipe_edges_parent_product_id_fkey" FOREIGN KEY ("parent_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_edges" ADD CONSTRAINT "recipe_edges_parent_subproduct_id_fkey" FOREIGN KEY ("parent_subproduct_id") REFERENCES "subproducts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_edges" ADD CONSTRAINT "recipe_edges_child_ingredient_id_fkey" FOREIGN KEY ("child_ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_edges" ADD CONSTRAINT "recipe_edges_child_subproduct_id_fkey" FOREIGN KEY ("child_subproduct_id") REFERENCES "subproducts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- CHECK CONSTRAINTS (data integrity at DB level)
-- ============================================================

-- recipe_edges: exactly one parent (product XOR subproduct)
ALTER TABLE "recipe_edges"
ADD CONSTRAINT "recipe_edges_one_parent_check"
CHECK (
  (parent_product_id IS NOT NULL AND parent_subproduct_id IS NULL)
  OR (parent_product_id IS NULL AND parent_subproduct_id IS NOT NULL)
);

-- recipe_edges: exactly one child (ingredient XOR subproduct)
ALTER TABLE "recipe_edges"
ADD CONSTRAINT "recipe_edges_one_child_check"
CHECK (
  (child_ingredient_id IS NOT NULL AND child_subproduct_id IS NULL)
  OR (child_ingredient_id IS NULL AND child_subproduct_id IS NOT NULL)
);

-- recipe_edges: a subproduct cannot reference itself directly
ALTER TABLE "recipe_edges"
ADD CONSTRAINT "recipe_edges_no_self_cycle_check"
CHECK (
  parent_subproduct_id IS NULL
  OR child_subproduct_id IS NULL
  OR parent_subproduct_id <> child_subproduct_id
);

-- recipe_edges: positive quantity
ALTER TABLE "recipe_edges"
ADD CONSTRAINT "recipe_edges_quantity_positive_check"
CHECK (quantity_neta > 0);

-- recipe_edges: merma in [0, 1) (0% to <100%)
ALTER TABLE "recipe_edges"
ADD CONSTRAINT "recipe_edges_merma_range_check"
CHECK (merma_pct >= 0 AND merma_pct < 1);

-- ingredients: positive conversion factor
ALTER TABLE "ingredients"
ADD CONSTRAINT "ingredients_conversion_factor_positive_check"
CHECK (conversion_factor > 0);

-- ingredients: non-negative threshold
ALTER TABLE "ingredients"
ADD CONSTRAINT "ingredients_threshold_min_nonneg_check"
CHECK (threshold_min >= 0);

-- subproducts: positive yield
ALTER TABLE "subproducts"
ADD CONSTRAINT "subproducts_yield_positive_check"
CHECK ("yield" > 0);

-- products: non-negative base price
ALTER TABLE "products"
ADD CONSTRAINT "products_base_price_nonneg_check"
CHECK (base_price >= 0);

-- products: combo_price required iff is_combo=true
ALTER TABLE "products"
ADD CONSTRAINT "products_combo_price_when_combo_check"
CHECK (
  (is_combo = false AND combo_price IS NULL)
  OR (is_combo = true AND combo_price IS NOT NULL)
);

-- combo_components: positive quantity
ALTER TABLE "combo_components"
ADD CONSTRAINT "combo_components_quantity_positive_check"
CHECK (quantity > 0);
