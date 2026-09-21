-- 1) Precio fijo (FIXED_PRICE): a cuánto se vende el producto con su tamaño.
--    Los extras se cobran encima; si el producto ya es más barato, la promo no
--    aplica (nunca sube el precio). CHECK defensivo como los cuatro que ya hay.
ALTER TABLE "promotions" ADD COLUMN "fixed_price" DECIMAL(12,2);

ALTER TABLE "promotions" ADD CONSTRAINT "chk_promo_fixed_price"
  CHECK (
    (type <> 'FIXED_PRICE' AND fixed_price IS NULL)
    OR (
      type = 'FIXED_PRICE'
      AND fixed_price IS NOT NULL
      AND fixed_price > 0
      AND discount_pct IS NULL
      AND discount_fixed IS NULL
      AND bogo_buy_qty IS NULL
      AND bogo_get_qty IS NULL
    )
  );

-- 2) Promoción limitada a VARIANTES de un producto ("Papas TERCOS · solo Pollo
--    y Miel ahumada"). Una fila con size_id NULL sigue siendo "el producto con
--    todas sus variantes" — o sea que ninguna fila existente cambia de
--    significado. Como un producto puede tener varias filas (una por variante),
--    la clave (promoción, producto) deja de servir: pasa a una clave propia.
--    La tabla es chica (una fila por producto en promo); reescribirla no cuesta.
ALTER TABLE "promotion_products" ADD COLUMN "id" TEXT;
UPDATE "promotion_products" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE "promotion_products" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "promotion_products" DROP CONSTRAINT "promotion_products_pkey";
ALTER TABLE "promotion_products" ADD CONSTRAINT "promotion_products_pkey" PRIMARY KEY ("id");

ALTER TABLE "promotion_products" ADD COLUMN "size_id" TEXT;

-- Restrict: un tamaño que una promo está usando no se borra por accidente. El
-- servicio lo bloquea antes con un mensaje que dice qué promo lo usa.
ALTER TABLE "promotion_products" ADD CONSTRAINT "promotion_products_size_id_fkey"
  FOREIGN KEY ("size_id") REFERENCES "product_sizes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "promotion_products_promotion_id_product_id_size_id_key"
  ON "promotion_products"("promotion_id", "product_id", "size_id");

-- La clave vieja servía de índice por promoción; se repone explícito.
CREATE INDEX "promotion_products_promotion_id_idx" ON "promotion_products"("promotion_id");
