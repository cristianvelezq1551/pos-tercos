-- Tarjeta (datáfono) como método de pago. En migración propia: ALTER TYPE
-- ADD VALUE no convive con otros statements en la misma transacción.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CARD';
