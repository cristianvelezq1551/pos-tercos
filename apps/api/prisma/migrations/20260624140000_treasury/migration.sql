-- Bolsillo de pago + responsable en gastos existentes.
ALTER TABLE "invoices" ADD COLUMN "payment_pocket" TEXT NOT NULL DEFAULT 'CUENTA';
ALTER TABLE "invoices" ADD COLUMN "responsible" TEXT;
ALTER TABLE "fixed_costs" ADD COLUMN "responsible" TEXT;
ALTER TABLE "fixed_cost_payments" ADD COLUMN "payment_pocket" TEXT NOT NULL DEFAULT 'CUENTA';
ALTER TABLE "payroll_payments" ADD COLUMN "payment_pocket" TEXT NOT NULL DEFAULT 'CUENTA';

-- Config de tesorería (fila única).
CREATE TABLE "treasury_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "anchor_date" DATE,
    "initial_cash" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "initial_bank" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "treasury_config_pkey" PRIMARY KEY ("id")
);
INSERT INTO "treasury_config" ("id") VALUES ('singleton');

-- Movimientos manuales de tesorería (traspasos + ajustes).
CREATE TABLE "treasury_movements" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "from_pocket" TEXT,
    "to_pocket" TEXT,
    "pocket" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "actor_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "treasury_movements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "treasury_movements_occurred_at_idx" ON "treasury_movements"("occurred_at");
