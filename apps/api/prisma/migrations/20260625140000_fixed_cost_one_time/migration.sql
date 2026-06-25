-- Gasto puntual/excepcional (ej. reparación): cuenta UNA vez, en el mes de su
-- fecha. Reusa todo el módulo de costos (pago + comprobante + bolsillo + P&G).
ALTER TYPE "FixedCostFrequency" ADD VALUE IF NOT EXISTS 'ONE_TIME';
