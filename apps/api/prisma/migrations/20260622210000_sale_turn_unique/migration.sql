-- Unicidad de turno por caja: dos cobros concurrentes no pueden compartir un
-- turn_number en la misma caja. Postgres trata NULLs como distintos, así que
-- las ventas sin pagar (turn_number NULL) o sin caja (shift_id NULL) no chocan.
CREATE UNIQUE INDEX "sales_shift_id_turn_number_key" ON "sales"("shift_id", "turn_number");
