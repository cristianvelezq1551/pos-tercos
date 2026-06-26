-- Convierte los statuses/discriminadores de las 3 máquinas de estado financieras
-- (treasury_movements, payable_commitments, cortesia_requests) de String a enums
-- nativos de Postgres. Así la integridad ya no depende solo de la app ni de los
-- CHECK NOT VALID: el TIPO de la columna rechaza cualquier valor inválido en
-- TODA escritura, y revalida las filas existentes (el USING cast falla ruidoso
-- si hubiera un valor inesperado — fail-safe, nunca corrompe en silencio).
--
-- fixed_cost_payments.payment_pocket queda como String: admite 'MIXTO' (dominio
-- distinto), fuera de alcance de esta conversión.

-- 1. Tipos enum.
CREATE TYPE "Pocket" AS ENUM ('EFECTIVO', 'CUENTA');
CREATE TYPE "TreasuryMovementKind" AS ENUM ('TRANSFER', 'ADJUSTMENT');
CREATE TYPE "TreasuryMovementStatus" AS ENUM ('ACTIVE', 'VOIDED');
CREATE TYPE "PayableStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');
CREATE TYPE "CortesiaStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- 2. Drop de los CHECK de DOMINIO (status/kind/pocket): el enum los supersede.
--    Los CHECK que también referencian estas columnas (transfer_amount, paid_split)
--    se dropean y se re-crean DESPUÉS del cambio de tipo (la dependencia de la
--    columna impediría el ALTER TYPE de otra forma). Los de monto se conservan.
ALTER TABLE "treasury_movements" DROP CONSTRAINT IF EXISTS "treasury_movements_kind_check";
ALTER TABLE "treasury_movements" DROP CONSTRAINT IF EXISTS "treasury_movements_status_check";
ALTER TABLE "treasury_movements" DROP CONSTRAINT IF EXISTS "treasury_movements_pockets_check";
ALTER TABLE "treasury_movements" DROP CONSTRAINT IF EXISTS "treasury_movements_transfer_amount_check";
ALTER TABLE "payable_commitments" DROP CONSTRAINT IF EXISTS "payable_commitments_status_check";
ALTER TABLE "payable_commitments" DROP CONSTRAINT IF EXISTS "payable_commitments_paid_split_check";
ALTER TABLE "cortesia_requests" DROP CONSTRAINT IF EXISTS "cortesia_requests_status_check";

-- 3. Cambio de tipo de columna (USING cast revalida cada fila existente).
ALTER TABLE "treasury_movements"
  ALTER COLUMN "kind" TYPE "TreasuryMovementKind" USING ("kind"::"TreasuryMovementKind");
ALTER TABLE "treasury_movements"
  ALTER COLUMN "from_pocket" TYPE "Pocket" USING ("from_pocket"::"Pocket");
ALTER TABLE "treasury_movements"
  ALTER COLUMN "to_pocket" TYPE "Pocket" USING ("to_pocket"::"Pocket");
ALTER TABLE "treasury_movements"
  ALTER COLUMN "pocket" TYPE "Pocket" USING ("pocket"::"Pocket");
ALTER TABLE "treasury_movements" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "treasury_movements"
  ALTER COLUMN "status" TYPE "TreasuryMovementStatus" USING ("status"::"TreasuryMovementStatus");
ALTER TABLE "treasury_movements" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

ALTER TABLE "payable_commitments" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "payable_commitments"
  ALTER COLUMN "status" TYPE "PayableStatus" USING ("status"::"PayableStatus");
ALTER TABLE "payable_commitments" ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "cortesia_requests" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "cortesia_requests"
  ALTER COLUMN "status" TYPE "CortesiaStatus" USING ("status"::"CortesiaStatus");
ALTER TABLE "cortesia_requests" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- 4. Re-crear los CHECK de monto que referencian las columnas convertidas. Van
--    NOT VALID (consistente con el resto: guardan escrituras nuevas sin fallar
--    sobre datos legacy). Las comparaciones con literales castean al enum.
ALTER TABLE "treasury_movements"
  ADD CONSTRAINT "treasury_movements_transfer_amount_check"
  CHECK (kind <> 'TRANSFER' OR amount > 0) NOT VALID;
ALTER TABLE "payable_commitments"
  ADD CONSTRAINT "payable_commitments_paid_split_check"
  CHECK (
    status <> 'PAID'
    OR (cash_amount = 0 AND bank_amount = 0)
    OR ABS(cash_amount + bank_amount - amount) <= 0.01
  ) NOT VALID;
