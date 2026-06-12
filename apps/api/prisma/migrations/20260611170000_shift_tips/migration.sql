-- Propinas del día: efectivo APARTE de la caja (no entra al expectedCash).
-- Se registra al cierre del turno y la nómina lo reparte entre trabajadores.
ALTER TABLE "shifts" ADD COLUMN "tips_collected" DECIMAL(14,2);
