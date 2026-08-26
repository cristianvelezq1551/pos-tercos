-- Unidad de inventario + factor de conversión en el snapshot de la sugerencia.
-- Sin esto la pantalla muestra "2.500 / 3.000" sin poder decir de qué (gramos,
-- unidades) ni cuánto de eso cubre una unidad de compra.
-- Nullable: las sugerencias viejas no lo tienen y no se pueden inventar.
ALTER TABLE "purchase_suggestions" ADD COLUMN "unit_stock" TEXT;
ALTER TABLE "purchase_suggestions" ADD COLUMN "conversion_factor" DECIMAL(14,6);
