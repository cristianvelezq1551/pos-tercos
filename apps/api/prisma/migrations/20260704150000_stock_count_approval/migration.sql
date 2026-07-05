-- Conteo de cocina con aprobación del admin (#7). El conteo del cocinero nace
-- PENDING y NO ajusta stock hasta que el admin lo aprueba. Los conteos previos
-- (inmediatos) y los del admin quedan APPROVED (default de la columna).
CREATE TYPE "CountStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "stock_counts"
  ADD COLUMN "status" "CountStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "resolved_by_id" TEXT,
  ADD COLUMN "resolved_at" TIMESTAMP(3),
  ADD COLUMN "resolver_note" TEXT;

CREATE INDEX "stock_counts_status_created_at_idx" ON "stock_counts" ("status", "created_at" DESC);
