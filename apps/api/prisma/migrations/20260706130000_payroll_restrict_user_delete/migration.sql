-- La nómina es evidencia CONTABLE (pagos con comprobante): un hard-delete de
-- usuario NO puede evaporarla en cascada (informe de calidad C6). El borrado
-- de usuarios va por soft-delete (active=false); si alguien intenta el DELETE
-- real con historia de nómina, la DB lo rechaza.
ALTER TABLE "payroll_days" DROP CONSTRAINT "payroll_days_user_id_fkey";
ALTER TABLE "payroll_days" ADD CONSTRAINT "payroll_days_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_adjustments" DROP CONSTRAINT "payroll_adjustments_user_id_fkey";
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_payments" DROP CONSTRAINT "payroll_payments_user_id_fkey";
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_week_payments" DROP CONSTRAINT "payroll_week_payments_user_id_fkey";
ALTER TABLE "payroll_week_payments" ADD CONSTRAINT "payroll_week_payments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
