-- §7.v71 — "Domicilio pagado del cajón".
--
-- Puramente ADITIVA: tres columnas nulas, sin default y sin tocar una sola
-- fila existente (ADD COLUMN sin default es O(1) desde Postgres 11). Todo lo
-- que hoy lee `cash_movements` —el efectivo esperado, el arqueo digital y sus
-- pantallas— sigue viendo exactamente lo mismo hasta que alguien use el botón.
--
-- Sin índice sobre `pair_id` a propósito: las dos patas se buscan siempre
-- dentro de una caja, y `(shift_id, created_at)` ya cubre esa consulta.
ALTER TABLE "cash_movements" ADD COLUMN "purpose" TEXT;
ALTER TABLE "cash_movements" ADD COLUMN "pair_id" TEXT;
ALTER TABLE "cash_movements" ADD COLUMN "treasury_movement_id" TEXT;
