-- "86" manual: marcar un producto agotado sin tocar el catálogo.
ALTER TABLE "products" ADD COLUMN "sold_out" BOOLEAN NOT NULL DEFAULT false;
