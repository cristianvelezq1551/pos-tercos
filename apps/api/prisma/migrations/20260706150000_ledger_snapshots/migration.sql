-- Snapshots mensuales del ledger FIFO (semilla del replay de COGS).
-- El corte es EXCLUSIVO: el snapshot resume movimientos created_at < cutoff_at.
CREATE TABLE "ledger_snapshots" (
    "id" TEXT NOT NULL,
    "cutoff_at" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "movements_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ledger_snapshots_cutoff_at_key" ON "ledger_snapshots"("cutoff_at");
