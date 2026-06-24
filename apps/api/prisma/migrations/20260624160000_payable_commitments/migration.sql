-- Compromisos / cuentas por pagar a personas (ad-hoc).
CREATE TABLE "payable_commitments" (
    "id" TEXT NOT NULL,
    "beneficiary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "cash_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bank_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "proof_image_key" TEXT,
    "paid_at" TIMESTAMP(3),
    "actor_id" TEXT,
    "created_by_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payable_commitments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payable_commitments_status_idx" ON "payable_commitments"("status");
