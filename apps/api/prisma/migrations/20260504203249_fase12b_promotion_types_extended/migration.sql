-- AlterTable: agregar columnas para BOGO + FIXED_OFF + COMBO_OFF.
-- discount_pct pasa a NULL (PERCENT_OFF lo requiere; otros types no).
ALTER TABLE "promotions" ADD COLUMN     "bogo_buy_qty" INTEGER,
ADD COLUMN     "bogo_get_qty" INTEGER,
ADD COLUMN     "discount_fixed" DECIMAL(10,2),
ALTER COLUMN "discount_pct" DROP NOT NULL;

-- CHECK constraints: cada type exige sus propios campos. Defensivos —
-- el motor de domain (apply-promotions.ts) también valida, pero acá
-- bloqueamos a nivel DB para que datos manuales (seeds, dba directo)
-- nunca dejen filas en estado inválido.

-- PERCENT_OFF: discount_pct requerido; resto NULL.
ALTER TABLE "promotions" ADD CONSTRAINT "chk_promo_pct"
  CHECK (
    type <> 'PERCENT_OFF' OR (
      discount_pct IS NOT NULL
      AND discount_fixed IS NULL
      AND bogo_buy_qty IS NULL
      AND bogo_get_qty IS NULL
    )
  );

-- FIXED_OFF: discount_fixed requerido; resto NULL.
ALTER TABLE "promotions" ADD CONSTRAINT "chk_promo_fixed"
  CHECK (
    type <> 'FIXED_OFF' OR (
      discount_fixed IS NOT NULL
      AND discount_pct IS NULL
      AND bogo_buy_qty IS NULL
      AND bogo_get_qty IS NULL
    )
  );

-- BOGO: bogo_buy_qty + bogo_get_qty (>0) requeridos; pct + fixed NULL.
ALTER TABLE "promotions" ADD CONSTRAINT "chk_promo_bogo"
  CHECK (
    type <> 'BOGO' OR (
      bogo_buy_qty IS NOT NULL
      AND bogo_get_qty IS NOT NULL
      AND bogo_buy_qty > 0
      AND bogo_get_qty > 0
      AND discount_pct IS NULL
      AND discount_fixed IS NULL
    )
  );

-- COMBO_OFF: discount_pct XOR discount_fixed (al menos uno, no ambos);
-- bogo_* NULL.
ALTER TABLE "promotions" ADD CONSTRAINT "chk_promo_combo"
  CHECK (
    type <> 'COMBO_OFF' OR (
      (
        (discount_pct IS NOT NULL AND discount_fixed IS NULL)
        OR
        (discount_pct IS NULL AND discount_fixed IS NOT NULL)
      )
      AND bogo_buy_qty IS NULL
      AND bogo_get_qty IS NULL
    )
  );
