-- Anulación de una factura CONFIRMADA.
--
-- El estado nuevo es lo que hace segura la operación: las siete consultas que
-- leen facturas desde fuera del módulo (tesorería, P&G, estado financiero,
-- reporte de compras, sugerencias de compra) filtran POSITIVAMENTE por
-- 'CONFIRMED', así que una factura anulada deja de contar en todas ellas sin
-- tocar una sola línea de esos archivos.
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'VOIDED';

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "voided_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "voided_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "void_reason" TEXT;

ALTER TABLE "invoices"
  DROP CONSTRAINT IF EXISTS "invoices_voided_by_id_fkey";
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_voided_by_id_fkey"
  FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
