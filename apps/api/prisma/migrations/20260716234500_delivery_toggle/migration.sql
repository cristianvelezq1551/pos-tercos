-- Switch de domicilios (2026-07-16). Igual que los otros gates, arranca
-- APAGADO: el toggle "domicilio" no aparece en la web hasta que el dueño diga
-- que reparte. Encenderlo es un acto deliberado, no un efecto del deploy.
ALTER TABLE "business_config"
  ADD COLUMN "delivery_enabled" BOOLEAN NOT NULL DEFAULT false;
