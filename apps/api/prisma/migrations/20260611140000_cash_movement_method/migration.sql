-- Movimientos de caja con MÉTODO: además del efectivo del cajón, se
-- registran entradas/salidas por transferencia/digital (ej. pagar un insumo
-- desde la cuenta). CASH ajusta el efectivo esperado; los digitales ajustan
-- el esperado del ARQUEO DIGITAL de su método.
ALTER TABLE "cash_movements" ADD COLUMN "method" "PaymentMethod" NOT NULL DEFAULT 'CASH';
CREATE INDEX "cash_movements_shift_id_method_idx" ON "cash_movements"("shift_id", "method");
