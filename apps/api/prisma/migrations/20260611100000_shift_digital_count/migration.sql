-- Arqueo digital al cierre de caja: snapshot por método digital
-- [{method, expected, counted, difference}] junto al arqueo de efectivo.
ALTER TABLE "shifts" ADD COLUMN "digital_count_breakdown" JSONB;
