-- Reparto por bolsillo (efectivo/cuenta/mixto) en facturas, costos fijos y nómina quincenal.
ALTER TABLE "invoices" ADD COLUMN "payment_cash_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN "payment_bank_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
UPDATE "invoices" SET "payment_bank_amount" = COALESCE("total",0) WHERE "payment_status"='PAID' AND "payment_pocket"='CUENTA';
UPDATE "invoices" SET "payment_cash_amount" = COALESCE("total",0) WHERE "payment_status"='PAID' AND "payment_pocket"='EFECTIVO';

ALTER TABLE "fixed_cost_payments" ADD COLUMN "cash_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "fixed_cost_payments" ADD COLUMN "bank_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
UPDATE "fixed_cost_payments" SET "bank_amount" = "amount" WHERE "payment_pocket"='CUENTA';
UPDATE "fixed_cost_payments" SET "cash_amount" = "amount" WHERE "payment_pocket"='EFECTIVO';

ALTER TABLE "payroll_payments" ADD COLUMN "cash_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payroll_payments" ADD COLUMN "bank_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
UPDATE "payroll_payments" SET "bank_amount" = "amount" WHERE "status"='PAID' AND "payment_pocket"='CUENTA';
UPDATE "payroll_payments" SET "cash_amount" = "amount" WHERE "status"='PAID' AND "payment_pocket"='EFECTIVO';
