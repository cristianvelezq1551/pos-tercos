-- Apertura de caja OFFLINE (B.4b): idempotencia por localId del POS.
ALTER TABLE "shifts" ADD COLUMN "offline_local_id" TEXT;

CREATE UNIQUE INDEX "shifts_offline_local_id_key" ON "shifts"("offline_local_id");
