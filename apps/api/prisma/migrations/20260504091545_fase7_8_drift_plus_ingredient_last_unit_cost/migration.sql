-- AlterTable
ALTER TABLE "ingredients" ADD COLUMN     "last_unit_cost" DECIMAL(14,4),
ADD COLUMN     "last_unit_cost_date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "delivered_gps_lat" DECIMAL(10,7),
ADD COLUMN     "delivered_gps_lng" DECIMAL(10,7),
ADD COLUMN     "delivery_proof_url" TEXT,
ADD COLUMN     "notified_canceled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notified_fifteen_min_warning" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notified_in_route" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notified_payment_instructions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notified_payment_received" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notified_ready_for_pickup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "public_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sales_public_token_key" ON "sales"("public_token");

