-- Una foto de preparación pasa a ser VARIAS: un plato se arma distinto según la
-- variante, y con una sola foto no hay forma de mostrarlo.
--
-- Cada elemento es {url, label}: el rótulo es lo que distingue una variante de
-- otra ("Sencilla", "Doble"). Sin él, dos fotos son indistinguibles.
--
-- La columna vieja se conserva DENTRO de la lista: el UPDATE corre antes del
-- DROP, así que ninguna foto ya cargada se pierde.

ALTER TABLE "products" ADD COLUMN "prep_images" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "subproducts" ADD COLUMN "prep_images" JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE "products"
   SET "prep_images" = jsonb_build_array(jsonb_build_object('url', "prep_image_url", 'label', NULL))
 WHERE "prep_image_url" IS NOT NULL;

UPDATE "subproducts"
   SET "prep_images" = jsonb_build_array(jsonb_build_object('url', "prep_image_url", 'label', NULL))
 WHERE "prep_image_url" IS NOT NULL;

ALTER TABLE "products" DROP COLUMN "prep_image_url";
ALTER TABLE "subproducts" DROP COLUMN "prep_image_url";
