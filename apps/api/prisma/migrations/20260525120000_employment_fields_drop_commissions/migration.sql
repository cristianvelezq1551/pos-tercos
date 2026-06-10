-- RRHH v2: salario diario + fecha de vinculación en el usuario; nómina quincenal
-- = días trabajados × salario diario. Se eliminan las comisiones (no se usan).

ALTER TABLE "users" ADD COLUMN "hire_date" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "daily_wage" DECIMAL(12,2);

DROP TABLE IF EXISTS "worker_commissions";
DROP TYPE IF EXISTS "WorkerCommissionType";
