-- Movimientos de efectivo (entradas/salidas) + arqueo por denominación.
CREATE TYPE "CashMovementType" AS ENUM ('IN', 'OUT');

CREATE TABLE "cash_movements" (
  "id" TEXT NOT NULL,
  "shift_id" TEXT NOT NULL,
  "type" "CashMovementType" NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_cash_movement_amount" CHECK ("amount" > 0)
);

CREATE INDEX "cash_movements_shift_id_created_at_idx" ON "cash_movements" ("shift_id", "created_at");

ALTER TABLE "cash_movements"
  ADD CONSTRAINT "cash_movements_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "cash_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Arqueo por denominación al cierre (JSON).
ALTER TABLE "shifts" ADD COLUMN "cash_count_breakdown" JSONB;
