-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('PURCHASE', 'SALE', 'MANUAL_ADJUSTMENT', 'WASTE', 'INITIAL');

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "delta" DECIMAL(14,4) NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "source_type" TEXT,
    "source_id" TEXT,
    "user_id" TEXT,
    "notes" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "before_json" JSONB,
    "after_json" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movements_idempotency_key_key" ON "inventory_movements"("idempotency_key");

-- CreateIndex
CREATE INDEX "inventory_movements_ingredient_id_created_at_idx" ON "inventory_movements"("ingredient_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "inventory_movements_type_created_at_idx" ON "inventory_movements"("type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_user_id_created_at_idx" ON "audit_log"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_action_created_at_idx" ON "audit_log"("action", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_created_at_idx" ON "audit_log"("entity_type", "entity_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- INSERT-ONLY ENFORCEMENT (audit + inventory)
-- ============================================================
-- Reject UPDATE and DELETE on insert-only tables. Movements and audit
-- entries are immutable by design — corrections come as new rows
-- (e.g., reversal movement) so the trail stays intact.

CREATE OR REPLACE FUNCTION reject_update_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is insert-only; UPDATE/DELETE rejected', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_movements_insert_only
  BEFORE UPDATE OR DELETE ON "inventory_movements"
  FOR EACH ROW EXECUTE FUNCTION reject_update_delete();

CREATE TRIGGER audit_log_insert_only
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION reject_update_delete();

-- ============================================================
-- CHECK CONSTRAINTS
-- ============================================================

-- inventory_movements: delta != 0 (no movements that don't move stock)
ALTER TABLE "inventory_movements"
ADD CONSTRAINT "inventory_movements_delta_nonzero_check"
CHECK (delta <> 0);
