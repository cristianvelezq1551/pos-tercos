-- ============================================================================
-- Nómina: 4 pagos fijos por mes (2 quincenas × 2 sub-pagos)
-- ============================================================================
--
-- `payroll_adjustments.period_start` cambia su semántica: antes era el lunes
-- ISO de la semana; ahora es el inicio del PAGO (uno de {día 1, 8, 16, 23} del
-- mismo mes). El año/mes se conserva; el día se ancla al pago que lo contiene:
--
--   Día  1–7  → pago 1 de Q1 (inicio día 1)
--   Día  8–15 → pago 2 de Q1 (inicio día 8)
--   Día 16–22 → pago 1 de Q2 (inicio día 16)
--   Día 23–fin→ pago 2 de Q2 (inicio día 23)
--
-- Esto migra TODAS las novedades existentes sin pérdida (cada lunes ISO previo
-- cae en exactamente un pago del mes al que pertenece).
-- ----------------------------------------------------------------------------

UPDATE "payroll_adjustments" SET "period_start" = (
  DATE_TRUNC('month', "period_start")::date +
  CASE
    WHEN EXTRACT(DAY FROM "period_start") <=  7 THEN 0
    WHEN EXTRACT(DAY FROM "period_start") <= 15 THEN 7   -- día 8 (offset 7)
    WHEN EXTRACT(DAY FROM "period_start") <= 22 THEN 15  -- día 16
    ELSE                                              22 -- día 23
  END
);
