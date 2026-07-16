-- Medios de pago dinámicos: el enum PaymentMethod deja de existir; la identidad
-- del método pasa a `payment_method_settings` (el dueño crea/edita/borra desde el
-- admin). Las columnas que guardaban el método pasan a texto (los valores
-- históricos DAVIPLATA/QR_BANCOLOMBIA quedan legibles como texto). Se quitan esos
-- dos del catálogo; quedan CASH/TRANSFER/CARD/NEQUI por defecto.

-- 1) Catálogo: PK enum -> code texto + columnas nuevas
ALTER TABLE "payment_method_settings" ALTER COLUMN "method" TYPE TEXT USING "method"::TEXT;
ALTER TABLE "payment_method_settings" RENAME COLUMN "method" TO "code";
ALTER TABLE "payment_method_settings" ADD COLUMN "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "payment_method_settings" ADD COLUMN "is_cash" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "payment_method_settings" ADD COLUMN "requires_verification" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "payment_method_settings" ADD COLUMN "reconciliation_source" TEXT;
ALTER TABLE "payment_method_settings" ADD COLUMN "is_system" BOOLEAN NOT NULL DEFAULT false;

-- Backfill de los built-ins
UPDATE "payment_method_settings" SET name = 'Efectivo',      is_cash = true,  requires_verification = false, is_system = true, reconciliation_source = NULL             WHERE code = 'CASH';
UPDATE "payment_method_settings" SET name = 'Transferencia', is_cash = false, requires_verification = true,                    reconciliation_source = 'BANCOLOMBIA_CSV' WHERE code = 'TRANSFER';
UPDATE "payment_method_settings" SET name = 'Tarjeta',       is_cash = false, requires_verification = true,                    reconciliation_source = NULL             WHERE code = 'CARD';
UPDATE "payment_method_settings" SET name = 'Nequi',         is_cash = false, requires_verification = true,                    reconciliation_source = 'NEQUI_CSV'      WHERE code = 'NEQUI';

-- Se retiran del catálogo (los pagos históricos siguen como texto)
DELETE FROM "payment_method_settings" WHERE code IN ('DAVIPLATA', 'QR_BANCOLOMBIA');

ALTER TABLE "payment_method_settings" ALTER COLUMN "name" DROP DEFAULT;
ALTER TABLE "payment_method_settings"
  ADD CONSTRAINT "chk_pms_recon_source"
  CHECK ("reconciliation_source" IS NULL OR "reconciliation_source" IN ('NEQUI_CSV', 'BANCOLOMBIA_CSV'));

-- 2) Columnas de valor: enum -> texto
ALTER TABLE "sale_payments" ALTER COLUMN "method" TYPE TEXT USING "method"::TEXT;

ALTER TABLE "cash_movements" ALTER COLUMN "method" DROP DEFAULT;
ALTER TABLE "cash_movements" ALTER COLUMN "method" TYPE TEXT USING "method"::TEXT;
ALTER TABLE "cash_movements" ALTER COLUMN "method" SET DEFAULT 'CASH';

ALTER TABLE "sales" ALTER COLUMN "payment_method" TYPE TEXT USING "payment_method"::TEXT;

-- 3) El enum ya no lo referencia nadie
DROP TYPE "PaymentMethod";
