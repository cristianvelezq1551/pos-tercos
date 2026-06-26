-- Reconcilia el índice de subproductos en inventory_movements: el schema declara
-- el COMPUESTO (subproduct_id, created_at DESC) pero la migración de subproductos
-- (20260528010000) creó solo el de columna única con otro nombre → drift real.
-- Lo alineamos al nombre/forma que espera Prisma (igual que ingredient/product).
DROP INDEX IF EXISTS "inventory_movements_subproduct_idx";
CREATE INDEX IF NOT EXISTS "inventory_movements_subproduct_id_created_at_idx"
  ON "inventory_movements" ("subproduct_id", "created_at" DESC);

-- ============================================================================
-- CHECK constraints DEFENSIVOS en las tablas financieras nuevas (cortesías,
-- tesorería, payables, pagos de costos fijos/nómina). Espejan las invariantes
-- que hoy solo valida la app — una fila inconsistente (escrita por un path que
-- no pase por la validación, o por un futuro endpoint) desviaría el saldo de
-- bolsillos de la Tesorería sin alarma.
--
-- TODOS van como NOT VALID: guardan TODA escritura nueva (INSERT/UPDATE) sin
-- re-validar las filas existentes al crear el constraint — así no fallan sobre
-- datos legacy (ej. pagos viejos hechos por el campo `method`, sin reparto).
-- Los CHECK de reparto exentan el caso "sin split" (cash=0 AND bank=0) para no
-- romper UPDATES (ej. anular) de filas legacy, pero SÍ atrapan un split no-cero
-- inconsistente. La suma se compara con tolerancia de 1 centavo (resolvePocketSplit).
-- ============================================================================

-- cortesia_requests
ALTER TABLE "cortesia_requests"
  ADD CONSTRAINT "cortesia_requests_status_check"
  CHECK (status IN ('PENDING','APPROVED','REJECTED')) NOT VALID;
ALTER TABLE "cortesia_requests"
  ADD CONSTRAINT "cortesia_requests_quantity_check"
  CHECK (quantity > 0) NOT VALID;
ALTER TABLE "cortesia_requests"
  ADD CONSTRAINT "cortesia_requests_amounts_check"
  CHECK (sale_price >= 0 AND (cost_amount IS NULL OR cost_amount >= 0)) NOT VALID;

-- treasury_movements
ALTER TABLE "treasury_movements"
  ADD CONSTRAINT "treasury_movements_kind_check"
  CHECK (kind IN ('TRANSFER','ADJUSTMENT')) NOT VALID;
ALTER TABLE "treasury_movements"
  ADD CONSTRAINT "treasury_movements_status_check"
  CHECK (status IN ('ACTIVE','VOIDED')) NOT VALID;
ALTER TABLE "treasury_movements"
  ADD CONSTRAINT "treasury_movements_pockets_check"
  CHECK (
    (from_pocket IS NULL OR from_pocket IN ('EFECTIVO','CUENTA')) AND
    (to_pocket   IS NULL OR to_pocket   IN ('EFECTIVO','CUENTA')) AND
    (pocket      IS NULL OR pocket      IN ('EFECTIVO','CUENTA'))
  ) NOT VALID;
-- TRANSFER mueve un monto positivo entre bolsillos; ADJUSTMENT lleva signo.
ALTER TABLE "treasury_movements"
  ADD CONSTRAINT "treasury_movements_transfer_amount_check"
  CHECK (kind <> 'TRANSFER' OR amount > 0) NOT VALID;

-- payable_commitments
ALTER TABLE "payable_commitments"
  ADD CONSTRAINT "payable_commitments_status_check"
  CHECK (status IN ('PENDING','PAID','CANCELLED')) NOT VALID;
ALTER TABLE "payable_commitments"
  ADD CONSTRAINT "payable_commitments_amounts_check"
  CHECK (amount >= 0 AND cash_amount >= 0 AND bank_amount >= 0) NOT VALID;
ALTER TABLE "payable_commitments"
  ADD CONSTRAINT "payable_commitments_paid_split_check"
  CHECK (
    status <> 'PAID'
    OR (cash_amount = 0 AND bank_amount = 0)
    OR ABS(cash_amount + bank_amount - amount) <= 0.01
  ) NOT VALID;

-- fixed_cost_payments
ALTER TABLE "fixed_cost_payments"
  ADD CONSTRAINT "fixed_cost_payments_pocket_check"
  CHECK (payment_pocket IN ('EFECTIVO','CUENTA','MIXTO')) NOT VALID;
ALTER TABLE "fixed_cost_payments"
  ADD CONSTRAINT "fixed_cost_payments_amounts_check"
  CHECK (
    cash_amount >= 0 AND bank_amount >= 0
    AND (
      (cash_amount = 0 AND bank_amount = 0)
      OR ABS(cash_amount + bank_amount - amount) <= 0.01
    )
  ) NOT VALID;

-- payroll_week_payments
ALTER TABLE "payroll_week_payments"
  ADD CONSTRAINT "payroll_week_payments_status_check"
  CHECK (status IN ('PAID','VOIDED')) NOT VALID;
ALTER TABLE "payroll_week_payments"
  ADD CONSTRAINT "payroll_week_payments_amounts_check"
  CHECK (
    amount >= 0 AND cash_amount >= 0 AND bank_amount >= 0
    AND (
      (cash_amount = 0 AND bank_amount = 0)
      OR ABS(cash_amount + bank_amount - amount) <= 0.01
    )
  ) NOT VALID;
