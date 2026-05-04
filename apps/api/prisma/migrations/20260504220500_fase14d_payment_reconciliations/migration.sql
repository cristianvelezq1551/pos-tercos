-- CreateTable: PaymentReconciliation
CREATE TABLE "payment_reconciliations" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "period_from" TEXT NOT NULL,
    "period_to" TEXT NOT NULL,
    "csv_rows_parsed" INTEGER NOT NULL,
    "pos_sales_evaluated" INTEGER NOT NULL,
    "matched" INTEGER NOT NULL,
    "unmatched_csv" INTEGER NOT NULL,
    "unmatched_sale" INTEGER NOT NULL,
    "report_json" JSONB NOT NULL,
    "imported_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_reconciliations_created_at_idx" ON "payment_reconciliations"("created_at" DESC);
CREATE INDEX "payment_reconciliations_source_created_at_idx" ON "payment_reconciliations"("source", "created_at" DESC);

ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_imported_by_id_fkey" FOREIGN KEY ("imported_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
