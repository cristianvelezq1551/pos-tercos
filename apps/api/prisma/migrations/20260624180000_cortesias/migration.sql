-- Solicitudes de cortesía: producto regalado (línea de un pedido o suelto).
-- El stock se descuenta al crear la solicitud (inventory_movements con
-- source_type='cortesia'); el gasto a costo se reconoce al aprobar.
CREATE TABLE "cortesia_requests" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sale_id" TEXT,
    "product_id" TEXT NOT NULL,
    "size_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "cost_amount" DECIMAL(14,2),
    "sale_price" DECIMAL(14,2) NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolver_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cortesia_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cortesia_requests_status_created_at_idx" ON "cortesia_requests"("status", "created_at");
