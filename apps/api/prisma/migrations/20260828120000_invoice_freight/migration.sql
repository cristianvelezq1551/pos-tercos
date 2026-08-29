-- Domicilio / flete de compra en la factura del proveedor.
--
-- Vive en el ENCABEZADO, no como invoice_item, a propósito: un ítem genera un
-- inventory_movement y entra al costo FIFO del insumo. El flete NO debe
-- encarecer ningún producto (decisión del dueño 2026-08-28) — es un gasto del
-- período que el P&G muestra en su propia línea.
--
-- `total` ya incluye este monto (es lo que se pagó al proveedor), así que
-- Tesorería y el cockpit de caja no cambian. Lo que cambia es la coherencia al
-- confirmar: total ≈ suma(items) + freight_amount.
--
-- Default 0 + NOT NULL: las facturas existentes quedan explícitamente "sin
-- flete", que es distinto de "no sabemos" y evita nulls en todas las sumas.
ALTER TABLE "invoices"
  ADD COLUMN "freight_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Defensa en DB (espeja el Zod): un flete negativo restaría del gasto del mes.
ALTER TABLE "invoices"
  ADD CONSTRAINT "chk_invoice_freight_nonneg" CHECK ("freight_amount" >= 0);
