-- Tipo nuevo de promoción: el producto se vende a un precio DEFINIDO mientras
-- dura la promo ("Sándwich a $22.000"). Va en su propia migración porque
-- Postgres no deja usar un valor de enum en la misma transacción que lo crea
-- (mismo precedente que `20260528000000_subproduct_inventory`).
ALTER TYPE "PromotionType" ADD VALUE 'FIXED_PRICE';
