-- Visibilidad en cocina y foto de preparación.
--
-- Migración ADITIVA: las tres columnas nacen con un default que preserva el
-- comportamiento actual (todo se sigue viendo en cocina; sin foto propia la
-- biblia cae a la foto de la carta). No toca ni una fila de datos existentes.

ALTER TABLE "ingredients" ADD COLUMN "show_in_kitchen" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "subproducts" ADD COLUMN "show_in_kitchen" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "products" ADD COLUMN "prep_image_url" TEXT;
ALTER TABLE "subproducts" ADD COLUMN "prep_image_url" TEXT;
