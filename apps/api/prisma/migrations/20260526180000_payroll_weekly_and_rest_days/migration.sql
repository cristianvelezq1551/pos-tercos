-- ============================================================================
-- Nómina: quincenal → SEMANAL + días de descanso cíclicos
-- ============================================================================
--
-- 1) Se agrega `users.rest_days_of_week` (Int[] con valores 0=domingo, 1=lunes,
--    …, 6=sábado). Solo afecta a empleados con payType=DAILY: esos días no se
--    pagan ni cuentan como "trabajados" (siguen siendo días empleados a efectos
--    de proración).
--
-- 2) `payroll_adjustments.period_start` cambia su semántica: antes era el
--    inicio de la quincena (día 1 o 16). Ahora es el LUNES de la semana. Para
--    no perder datos, las filas existentes se re-alinean al lunes de la semana
--    que contenía su periodStart (PG `date_trunc('week')` devuelve lunes ISO).
--
--    Nota: tras la migración pueden quedar varias novedades del mismo trabajador
--    apuntando al mismo lunes (las del día 1 y las del día 16 caen en semanas
--    distintas, pero si ambas estaban en una semana cruzada entre quincenas,
--    se acumulan). Eso es correcto: se suman al cálculo de la semana.
-- ----------------------------------------------------------------------------

ALTER TABLE "users"
  ADD COLUMN "rest_days_of_week" INT[] NOT NULL DEFAULT '{}';

UPDATE "payroll_adjustments"
   SET "period_start" = DATE_TRUNC('week', "period_start")::date;
