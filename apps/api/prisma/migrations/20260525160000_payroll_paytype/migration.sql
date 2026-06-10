-- Nómina v3: modalidad de pago (mensual/diario), liquidación quincenal con
-- días editables y novedades, y terminación de empleo.

CREATE TYPE "PayType" AS ENUM ('MONTHLY', 'DAILY');

-- Empleo en el usuario: reemplaza daily_wage por pay_type + salary_amount,
-- agrega termination_date.
ALTER TABLE "users" DROP COLUMN IF EXISTS "daily_wage";
ALTER TABLE "users" ADD COLUMN "pay_type" "PayType";
ALTER TABLE "users" ADD COLUMN "salary_amount" DECIMAL(12,2);
ALTER TABLE "users" ADD COLUMN "termination_date" TIMESTAMP(3);

-- Asistencia anterior reemplazada por días de pago con monto editable.
DROP TABLE IF EXISTS "worker_attendance";

CREATE TABLE "payroll_days" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "work_date" DATE NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "note" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payroll_days_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payroll_days_user_id_work_date_key" ON "payroll_days"("user_id", "work_date");
CREATE INDEX "payroll_days_user_id_work_date_idx" ON "payroll_days"("user_id", "work_date" DESC);
ALTER TABLE "payroll_days" ADD CONSTRAINT "payroll_days_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "payroll_adjustments" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "period_start" DATE NOT NULL,
  "concept" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "note" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payroll_adjustments_user_id_period_start_idx" ON "payroll_adjustments"("user_id", "period_start");
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
