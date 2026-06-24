-- Pago de nómina semanal por bolsillo (efectivo/cuenta), permite mixto.
ALTER TABLE "payroll_week_payments" ADD COLUMN "cash_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payroll_week_payments" ADD COLUMN "bank_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
-- Backfill desde el método único previo.
UPDATE "payroll_week_payments" SET "cash_amount" = "amount" WHERE "method" = 'CASH';
UPDATE "payroll_week_payments" SET "bank_amount" = "amount" WHERE "method" IS DISTINCT FROM 'CASH';
ALTER TABLE "payroll_week_payments" ALTER COLUMN "method" DROP NOT NULL;
