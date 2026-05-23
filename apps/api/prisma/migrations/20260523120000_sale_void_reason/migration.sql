-- Motivo de anulación visible en el historial del cajero.
ALTER TABLE "sales" ADD COLUMN "void_reason" TEXT;
