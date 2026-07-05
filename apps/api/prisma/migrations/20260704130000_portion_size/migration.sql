-- Porción canónica por insumo/subproducto (#4): el inventario muestra
-- "porciones" = stock ÷ portion_size además de la unidad nativa (kg/g/unidad).
ALTER TABLE "ingredients" ADD COLUMN "portion_size" DECIMAL(14,4);
ALTER TABLE "subproducts" ADD COLUMN "portion_size" DECIMAL(14,4);
