-- ============================================================================
-- Control de pago de costos fijos (arriendo, servicios, software, etc).
-- ============================================================================
--
-- El módulo `fixed_costs` define obligaciones recurrentes. Esta tabla guarda
-- cuándo se pagó cada una y por qué período. Análogo a `payroll_payments` y
-- al payment status nuevo de `invoices`.
--
-- Reglas:
-- - Un registro = un (costo fijo, año, mes). UNIQUE evita duplicados.
-- - `amount` es snapshot de lo realmente pagado (puede diferir del
--    `fixed_costs.amount` si hubo aumento o si el dueño pagó distinto).
-- - `proof_image_key` es obligatorio (CHECK). Solo Dueño + PIN.
-- - `actor_id` puede quedar null si se borra el usuario (SetNull).
-- - Para frequency=ANNUAL el módulo usa `period_month=1` por convención
--    (el primer pago del año cubre todo el año).
-- ----------------------------------------------------------------------------

CREATE TABLE "fixed_cost_payments" (
  "id" TEXT NOT NULL,
  "fixed_cost_id" TEXT NOT NULL,
  "period_year" INTEGER NOT NULL,
  "period_month" INTEGER NOT NULL,
  "amount" DECIMAL(14, 2) NOT NULL,
  "paid_at" TIMESTAMP(3) NOT NULL,
  "proof_image_key" TEXT NOT NULL,
  "actor_id" TEXT,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fixed_cost_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_fcp_period_month" CHECK ("period_month" BETWEEN 1 AND 12),
  CONSTRAINT "chk_fcp_period_year" CHECK ("period_year" BETWEEN 2020 AND 2100),
  CONSTRAINT "chk_fcp_amount_nonneg" CHECK ("amount" >= 0)
);

CREATE UNIQUE INDEX "fcp_cost_period_uq"
  ON "fixed_cost_payments" ("fixed_cost_id", "period_year", "period_month");

CREATE INDEX "fcp_paid_at_idx" ON "fixed_cost_payments" ("paid_at");

ALTER TABLE "fixed_cost_payments"
  ADD CONSTRAINT "fixed_cost_payments_fixed_cost_id_fkey"
  FOREIGN KEY ("fixed_cost_id") REFERENCES "fixed_costs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fixed_cost_payments"
  ADD CONSTRAINT "fixed_cost_payments_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
