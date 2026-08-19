-- Insumos/subproductos que NO frenan la venta cuando falta su stock
-- ("consumibles": servilletas, sal, salsa opcional). Se siguen descontando y
-- costeando igual — el flag SOLO afecta la disponibilidad del catálogo.
--
-- Default true = comportamiento actual intacto: nada cambia hasta que el dueño
-- marque un insumo como consumible.
ALTER TABLE "ingredients" ADD COLUMN "blocks_availability" boolean NOT NULL DEFAULT true;
ALTER TABLE "subproducts" ADD COLUMN "blocks_availability" boolean NOT NULL DEFAULT true;

-- Override POR RECETA. NULL = hereda el flag del insumo/subproducto.
-- Caso de uso: la lechuga es crítica en la ensalada y adorno en la hamburguesa.
ALTER TABLE "recipe_edges" ADD COLUMN "blocks_availability" boolean;
