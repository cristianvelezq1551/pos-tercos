-- CreateEnum
CREATE TYPE "WorkerCommissionType" AS ENUM ('PERCENT_OF_SHIFT', 'FIXED_PER_SALE');

-- CreateTable: WorkerAttendance
CREATE TABLE "worker_attendance" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "check_in" TIMESTAMP(3) NOT NULL,
    "check_out" TIMESTAMP(3),
    "hours_worked" DECIMAL(6,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_attendance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "worker_attendance_user_id_check_in_idx" ON "worker_attendance"("user_id", "check_in" DESC);
CREATE INDEX "worker_attendance_check_in_idx" ON "worker_attendance"("check_in");

ALTER TABLE "worker_attendance" ADD CONSTRAINT "worker_attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK: checkOut > checkIn cuando ambos definidos.
ALTER TABLE "worker_attendance" ADD CONSTRAINT "chk_attendance_checkout_after_checkin"
  CHECK (check_out IS NULL OR check_out > check_in);

-- CHECK: hours_worked >= 0 cuando definido.
ALTER TABLE "worker_attendance" ADD CONSTRAINT "chk_attendance_hours_nonneg"
  CHECK (hours_worked IS NULL OR hours_worked >= 0);

-- CreateTable: WorkerCommission
CREATE TABLE "worker_commissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "WorkerCommissionType" NOT NULL DEFAULT 'PERCENT_OF_SHIFT',
    "percent" DECIMAL(5,4),
    "fixed_amount" DECIMAL(12,2),
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_commissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "worker_commissions_user_id_applied_at_idx" ON "worker_commissions"("user_id", "applied_at" DESC);

ALTER TABLE "worker_commissions" ADD CONSTRAINT "worker_commissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK per-type: PERCENT_OF_SHIFT requiere percent en [0, 1) y fixed_amount NULL.
--                  FIXED_PER_SALE requiere fixed_amount > 0 y percent NULL.
ALTER TABLE "worker_commissions" ADD CONSTRAINT "chk_commission_percent"
  CHECK (
    type <> 'PERCENT_OF_SHIFT' OR (
      percent IS NOT NULL AND percent >= 0 AND percent < 1
      AND fixed_amount IS NULL
    )
  );

ALTER TABLE "worker_commissions" ADD CONSTRAINT "chk_commission_fixed"
  CHECK (
    type <> 'FIXED_PER_SALE' OR (
      fixed_amount IS NOT NULL AND fixed_amount > 0
      AND percent IS NULL
    )
  );
