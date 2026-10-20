-- Variante del componente de un combo ("2 Papas TERCOS · Pollo"). PLAN-COMBO-CON-VARIANTE.md.
--
-- Puramente ADITIVA: la columna nace NULL en todas las filas, y NULL significa
-- exactamente lo de antes (producto sin variante). ADD COLUMN sin default no
-- reescribe la tabla. Ningún combo existente cambia de significado.
ALTER TABLE "combo_components" ADD COLUMN "size_id" TEXT;

-- Restrict: una variante que usa un combo no se borra por accidente. El
-- servicio lo bloquea antes con un mensaje que dice qué combo la usa.
ALTER TABLE "combo_components" ADD CONSTRAINT "combo_components_size_id_fkey"
  FOREIGN KEY ("size_id") REFERENCES "product_sizes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "combo_components_size_id_idx" ON "combo_components"("size_id");
