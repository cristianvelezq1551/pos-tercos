-- Paso a paso de preparación (biblia del cocinero) para productos y subproductos.
-- TEXT[] ordenado, default vacío (el dueño lo llena desde el admin).
ALTER TABLE "products" ADD COLUMN "preparation_steps" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "subproducts" ADD COLUMN "preparation_steps" TEXT[] NOT NULL DEFAULT '{}';
