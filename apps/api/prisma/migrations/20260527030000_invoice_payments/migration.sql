-- ============================================================================
-- Control de pago de facturas a proveedores.
-- ============================================================================
--
-- Hasta ahora el `status` de la factura era solo sobre la validación de la IA
-- (PENDING_REVIEW / CONFIRMED / REJECTED). NO trackeaba si la factura
-- realmente se PAGÓ al proveedor. Esa info recién entra con este módulo
-- para poder ver "facturas pendientes por pagar" en el cockpit financiero.
--
-- Diseño: 5 columnas opcionales sobre `invoices`. NO es tabla aparte
-- porque una factura tiene un único pago (no hay parciales en este negocio).
--
-- Reglas:
-- - `payment_status` solo aplica a facturas con status='CONFIRMED'. Las
--    PENDING_REVIEW/REJECTED no se pagan (la rechazada nunca movió stock).
-- - 'PENDING' = factura confirmada pero todavía no se transfirió.
-- - 'PAID' = ya se pagó. Exige `paid_at` + `payment_proof_key` (foto del
--    comprobante de transferencia) y opcionalmente `payment_actor_id`.
-- - `payment_actor_id` puede quedar null si el usuario que marcó se borra
--    después (SetNull); preserva el registro para histórico.
--
-- Backfill: a las facturas ya CONFIRMED al deployment les seteamos
-- payment_status='PENDING' para que aparezcan en "por pagar" hasta que el
-- dueño las marque manualmente (no podemos asumir que estaban pagadas).
-- ----------------------------------------------------------------------------

ALTER TABLE "invoices"
  ADD COLUMN "payment_status"    TEXT,
  ADD COLUMN "paid_at"           TIMESTAMP(3),
  ADD COLUMN "payment_proof_key" TEXT,
  ADD COLUMN "payment_actor_id"  TEXT,
  ADD COLUMN "payment_note"      TEXT;

-- Validaciones de integridad.
ALTER TABLE "invoices"
  ADD CONSTRAINT "chk_invoice_payment_status"
    CHECK ("payment_status" IS NULL OR "payment_status" IN ('PENDING', 'PAID')),
  ADD CONSTRAINT "chk_invoice_paid_requires_evidence"
    CHECK (
      "payment_status" IS DISTINCT FROM 'PAID'
      OR ("paid_at" IS NOT NULL AND "payment_proof_key" IS NOT NULL)
    ),
  ADD CONSTRAINT "chk_invoice_payment_only_when_confirmed"
    CHECK ("payment_status" IS NULL OR "status" = 'CONFIRMED');

-- FK opcional al actor (Dueño que marcó el pago).
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_payment_actor_id_fkey"
  FOREIGN KEY ("payment_actor_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Index para listar pendientes y pagadas.
CREATE INDEX "invoices_payment_status_idx"
  ON "invoices" ("payment_status", "created_at" DESC);

-- Backfill: facturas confirmadas históricas → PENDING.
UPDATE "invoices"
   SET "payment_status" = 'PENDING'
 WHERE "status" = 'CONFIRMED'
   AND "payment_status" IS NULL;
