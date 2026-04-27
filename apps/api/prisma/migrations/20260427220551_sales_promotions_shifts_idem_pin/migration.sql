-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('COUNTER', 'WEB_PICKUP', 'WEB_DELIVERY');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('PENDIENTE_PAGO', 'PAGADO', 'EN_PREPARACION', 'LISTO_DESPACHO', 'ASIGNADO', 'EN_RUTA', 'ENTREGADO', 'CANCELADO_NO_PAGO', 'CANCELADO_SIN_REEMBOLSO', 'INTENTO_FALLIDO', 'DEVUELTO', 'EN_DISPUTA', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'NEQUI', 'DAVIPLATA', 'QR_BANCOLOMBIA', 'TRANSFER');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED', 'RECONCILED');

-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('PERCENT_OFF', 'BOGO', 'FIXED_OFF', 'COMBO_OFF');

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "receipt_number" BIGINT NOT NULL,
    "type" "SaleType" NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'PENDIENTE_PAGO',
    "turn_number" INTEGER NOT NULL,
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "customer_nit" TEXT,
    "delivery_address" TEXT,
    "delivery_lat" DECIMAL(10,7),
    "delivery_lng" DECIMAL(10,7),
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "payment_method" "PaymentMethod",
    "paid_at" TIMESTAMP(3),
    "paid_by_user_id" TEXT,
    "cashier_id" TEXT,
    "shift_id" TEXT,
    "repartidor_id" TEXT,
    "assigned_at" TIMESTAMP(3),
    "picked_up_at" TIMESTAMP(3),
    "departed_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "size_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "modifiers_json" JSONB NOT NULL DEFAULT '[]',
    "applied_promotion_id" TEXT,
    "line_subtotal" DECIMAL(14,2) NOT NULL,
    "line_discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_status_log" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "status_from" TEXT,
    "status_to" TEXT NOT NULL,
    "user_id" TEXT,
    "notes" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_status_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "cashier_id" TEXT NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "opening_cash" DECIMAL(14,2) NOT NULL,
    "expected_cash" DECIMAL(14,2),
    "counted_cash" DECIMAL(14,2),
    "difference" DECIMAL(14,2),
    "notes" TEXT,
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PromotionType" NOT NULL DEFAULT 'PERCENT_OFF',
    "discount_pct" DECIMAL(5,4) NOT NULL,
    "days_of_week_mask" INTEGER NOT NULL,
    "time_start" TEXT NOT NULL,
    "time_end" TEXT NOT NULL,
    "active_from" DATE,
    "active_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_products" (
    "promotion_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,

    CONSTRAINT "promotion_products_pkey" PRIMARY KEY ("promotion_id","product_id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "response_json" JSONB NOT NULL,
    "status_code" INTEGER NOT NULL,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "approval_pins" (
    "user_id" TEXT NOT NULL,
    "pin_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_pins_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_receipt_number_key" ON "sales"("receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_idempotency_key_key" ON "sales"("idempotency_key");

-- CreateIndex
CREATE INDEX "sales_status_created_at_idx" ON "sales"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sales_cashier_id_created_at_idx" ON "sales"("cashier_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sales_repartidor_id_status_idx" ON "sales"("repartidor_id", "status");

-- CreateIndex
CREATE INDEX "sales_type_status_created_at_idx" ON "sales"("type", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sales_shift_id_idx" ON "sales"("shift_id");

-- CreateIndex
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items"("sale_id");

-- CreateIndex
CREATE INDEX "sale_items_product_id_idx" ON "sale_items"("product_id");

-- CreateIndex
CREATE INDEX "sale_items_applied_promotion_id_idx" ON "sale_items"("applied_promotion_id");

-- CreateIndex
CREATE INDEX "sale_status_log_sale_id_changed_at_idx" ON "sale_status_log"("sale_id", "changed_at");

-- CreateIndex
CREATE INDEX "shifts_cashier_id_status_idx" ON "shifts"("cashier_id", "status");

-- CreateIndex
CREATE INDEX "shifts_status_opened_at_idx" ON "shifts"("status", "opened_at" DESC);

-- CreateIndex
CREATE INDEX "promotions_is_active_idx" ON "promotions"("is_active");

-- CreateIndex
CREATE INDEX "promotion_products_product_id_idx" ON "promotion_products"("product_id");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_paid_by_user_id_fkey" FOREIGN KEY ("paid_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_repartidor_id_fkey" FOREIGN KEY ("repartidor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_size_id_fkey" FOREIGN KEY ("size_id") REFERENCES "product_sizes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_applied_promotion_id_fkey" FOREIGN KEY ("applied_promotion_id") REFERENCES "promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_status_log" ADD CONSTRAINT "sale_status_log_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_status_log" ADD CONSTRAINT "sale_status_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_products" ADD CONSTRAINT "promotion_products_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_products" ADD CONSTRAINT "promotion_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_pins" ADD CONSTRAINT "approval_pins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =====================================================================
-- RECEIPT SEQUENCE (FASE 5.2)
-- =====================================================================
-- Sequence monotónica para receipt_number. Postgres garantiza
-- unicidad incluso ante rollbacks (el number queda "consumido"
-- pero no se reusa). Saltos detectables vía cron en FASE 5.15.
CREATE SEQUENCE "receipt_seq" START 1 INCREMENT 1 MINVALUE 1 NO CYCLE;

ALTER TABLE "sales"
  ALTER COLUMN "receipt_number" SET DEFAULT nextval('receipt_seq');

-- =====================================================================
-- CHECK CONSTRAINTS — coherencia de totales y rangos
-- =====================================================================

-- sales: totales no negativos + total = subtotal - discount (epsilon 0.01)
ALTER TABLE "sales" ADD CONSTRAINT "sales_subtotal_nonneg" CHECK ("subtotal" >= 0);
ALTER TABLE "sales" ADD CONSTRAINT "sales_discount_nonneg" CHECK ("discount_total" >= 0);
ALTER TABLE "sales" ADD CONSTRAINT "sales_total_nonneg" CHECK ("total" >= 0);
ALTER TABLE "sales" ADD CONSTRAINT "sales_total_matches_breakdown"
  CHECK (ABS("total" - ("subtotal" - "discount_total")) < 0.01);
ALTER TABLE "sales" ADD CONSTRAINT "sales_failed_attempts_nonneg"
  CHECK ("failed_attempts" >= 0);
ALTER TABLE "sales" ADD CONSTRAINT "sales_paid_at_with_method"
  CHECK (("paid_at" IS NULL AND "payment_method" IS NULL)
      OR ("paid_at" IS NOT NULL AND "payment_method" IS NOT NULL));

-- sale_items: quantity > 0, precios no negativos, line_total = line_subtotal - line_discount
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_quantity_positive"
  CHECK ("quantity" > 0);
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_unit_price_nonneg"
  CHECK ("unit_price" >= 0);
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_subtotal_nonneg"
  CHECK ("line_subtotal" >= 0);
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_discount_nonneg"
  CHECK ("line_discount" >= 0);
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_total_nonneg"
  CHECK ("line_total" >= 0);
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_total_matches_breakdown"
  CHECK (ABS("line_total" - ("line_subtotal" - "line_discount")) < 0.01);

-- shifts: opening_cash y counted_cash no negativos; status coherente con closed_at
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_opening_cash_nonneg"
  CHECK ("opening_cash" >= 0);
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_counted_cash_nonneg"
  CHECK ("counted_cash" IS NULL OR "counted_cash" >= 0);
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_status_closed_at_coherent"
  CHECK (
    ("status" = 'OPEN' AND "closed_at" IS NULL)
    OR ("status" IN ('CLOSED', 'RECONCILED') AND "closed_at" IS NOT NULL)
  );

-- promotions: discount_pct en [0,1), days mask 1..127, time format HH:MM:SS
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_discount_pct_range"
  CHECK ("discount_pct" >= 0 AND "discount_pct" < 1);
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_days_mask_range"
  CHECK ("days_of_week_mask" >= 1 AND "days_of_week_mask" <= 127);
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_time_start_format"
  CHECK ("time_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$');
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_time_end_format"
  CHECK ("time_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$');
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_active_dates_coherent"
  CHECK ("active_from" IS NULL OR "active_to" IS NULL OR "active_to" >= "active_from");

-- idempotency_keys: expires_at > created_at, status_code HTTP válido
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_expires_after_created"
  CHECK ("expires_at" > "created_at");
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_status_code_valid"
  CHECK ("status_code" >= 100 AND "status_code" < 600);

-- approval_pins: pin_hash no vacío
ALTER TABLE "approval_pins" ADD CONSTRAINT "approval_pins_hash_not_empty"
  CHECK (LENGTH("pin_hash") > 0);

-- =====================================================================
-- TRIGGER: sale_status_log es insert-only (igual que inventory_movements
-- y audit_log de FASE 3). Reusa la function reject_update_delete().
-- =====================================================================

DROP TRIGGER IF EXISTS "trg_sale_status_log_no_update_delete" ON "sale_status_log";

CREATE TRIGGER "trg_sale_status_log_no_update_delete"
BEFORE UPDATE OR DELETE ON "sale_status_log"
FOR EACH ROW EXECUTE FUNCTION reject_update_delete();

-- =====================================================================
-- TRIGGER: approval_pins solo permite users con role en (ADMIN_OPERATIVO, DUENO)
-- (CHECK con subquery no es válido en Postgres → trigger BEFORE INSERT/UPDATE)
-- =====================================================================

CREATE OR REPLACE FUNCTION enforce_approval_pin_role() RETURNS trigger AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role::text INTO user_role FROM users WHERE id = NEW.user_id;
  IF user_role IS NULL THEN
    RAISE EXCEPTION 'approval_pins: user % does not exist', NEW.user_id;
  END IF;
  IF user_role NOT IN ('ADMIN_OPERATIVO', 'DUENO') THEN
    RAISE EXCEPTION 'approval_pins: only ADMIN_OPERATIVO or DUENO can have a PIN (user % has role %)', NEW.user_id, user_role;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_approval_pins_role_check"
BEFORE INSERT OR UPDATE OF "user_id" ON "approval_pins"
FOR EACH ROW EXECUTE FUNCTION enforce_approval_pin_role();
