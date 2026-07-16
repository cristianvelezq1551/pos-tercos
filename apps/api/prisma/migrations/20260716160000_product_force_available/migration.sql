-- "Forzar disponible": el dueño reactiva un producto aunque el stock de sus
-- insumos/subproductos no alcance en el sistema (stock físico no registrado).
-- Pisa el cómputo de disponibilidad y salta el guard de stock al cobrar; el
-- faltante queda en negativo + bitácora. Excluyente con sold_out.
ALTER TABLE "products" ADD COLUMN "force_available" boolean NOT NULL DEFAULT false;

-- Defensa DB: un producto no puede estar 86 (sold_out) y forzado a la vez.
ALTER TABLE "products"
  ADD CONSTRAINT "chk_product_availability_override"
  CHECK (NOT ("sold_out" AND "force_available"));
