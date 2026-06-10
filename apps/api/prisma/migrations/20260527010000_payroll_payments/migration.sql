-- ============================================================================
-- Control de pagos: marca cada pago de cada trabajador como PAGADO (con
-- comprobante = imagen) o CANCELADO (con motivo). Solo Dueño + PIN.
-- ============================================================================
--
-- Una fila = un trabajador × un pago (período identificado por `period_start`,
-- que coincide con `payroll_adjustments.period_start`: uno de día 1, 8, 16, 23
-- del mes). Constraint UNIQUE garantiza que no haya dos registros para el
-- mismo (trabajador, pago).
--
-- - status='PAID' obliga `proof_image_key` (no nulo) — sin foto no hay pago.
-- - status='CANCELLED' no requiere imagen (motivo va en `note`).
-- - `amount` es SNAPSHOT del total al momento de marcar (auditoría histórica
--   intacta aunque luego se editen días/novedades).
-- - `actor_id` puede quedar null si el usuario se borra (SetNull); preserva
--   la fila para histórico.
-- ----------------------------------------------------------------------------

CREATE TABLE "payroll_payments" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "period_start" DATE NOT NULL,
  "status" TEXT NOT NULL,
  "amount" DECIMAL(12, 2) NOT NULL,
  "resolved_at" TIMESTAMP(3) NOT NULL,
  "actor_id" TEXT,
  "proof_image_key" TEXT,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_payroll_payment_status" CHECK ("status" IN ('PAID', 'CANCELLED')),
  CONSTRAINT "chk_payroll_payment_amount_nonneg" CHECK ("amount" >= 0),
  CONSTRAINT "chk_payroll_payment_paid_needs_proof"
    CHECK ("status" <> 'PAID' OR "proof_image_key" IS NOT NULL)
);

CREATE UNIQUE INDEX "payroll_payments_user_period_uq"
  ON "payroll_payments" ("user_id", "period_start");
CREATE INDEX "payroll_payments_period_idx"
  ON "payroll_payments" ("period_start");

ALTER TABLE "payroll_payments"
  ADD CONSTRAINT "payroll_payments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
