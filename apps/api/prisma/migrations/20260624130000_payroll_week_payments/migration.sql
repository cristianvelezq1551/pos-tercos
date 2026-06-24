-- Pago semanal de nómina (DIARIO) con abonos parciales por días + comprobante.
CREATE TABLE "payroll_week_payments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "week_start" DATE NOT NULL,
    "paid_days" JSONB NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "proof_image_key" TEXT NOT NULL,
    "actor_id" TEXT,
    "cash_movement_id" TEXT,
    "shift_id" TEXT,
    "note" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payroll_week_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payroll_week_payments_user_id_week_start_idx" ON "payroll_week_payments"("user_id", "week_start");
CREATE INDEX "payroll_week_payments_week_start_idx" ON "payroll_week_payments"("week_start");

ALTER TABLE "payroll_week_payments" ADD CONSTRAINT "payroll_week_payments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
