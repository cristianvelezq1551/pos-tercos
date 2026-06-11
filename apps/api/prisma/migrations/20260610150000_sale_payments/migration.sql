-- Pagos divididos: tabla sale_payments como fuente única de verdad del
-- método de pago (1 fila por cobro simple, N por cuenta dividida).

CREATE TABLE "sale_payments" (
  "id" TEXT NOT NULL,
  "sale_id" TEXT NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "amount_received" DECIMAL(12,2),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_fkey"
  FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_amount_positive"
  CHECK ("amount" > 0);
-- El vuelto sale de recibir MÁS que la parte; nunca menos.
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_received_gte_amount"
  CHECK ("amount_received" IS NULL OR "amount_received" >= "amount");

CREATE INDEX "sale_payments_sale_id_idx" ON "sale_payments"("sale_id");
CREATE INDEX "sale_payments_method_created_at_idx" ON "sale_payments"("method", "created_at");

-- Las ventas DIVIDIDAS quedan con payment_method NULL (el detalle vive en
-- sale_payments). El CHECK viejo exigía método si había paid_at; queda solo
-- la dirección "sin pagar → sin método".
ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "sales_paid_at_with_method";
ALTER TABLE "sales" ADD CONSTRAINT "sales_unpaid_has_no_method"
  CHECK ("paid_at" IS NOT NULL OR "payment_method" IS NULL);

-- Backfill: cada venta ya cobrada genera su fila de pago único.
INSERT INTO "sale_payments" ("id", "sale_id", "method", "amount", "created_at")
SELECT gen_random_uuid(), "id", "payment_method", "total", "paid_at"
FROM "sales"
WHERE "paid_at" IS NOT NULL AND "payment_method" IS NOT NULL;
