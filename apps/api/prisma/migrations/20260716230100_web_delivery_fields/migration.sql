-- Datos de entrega del pedido a domicilio.
--
-- `delivery_address` es TEXTO LIBRE a propósito: el repartidor necesita "Cra 31
-- #37s-49, torre 2, apto 502, portería azul", no un par de coordenadas. El GPS
-- (delivery_lat/lng) sirve para validar la zona de cobertura y para abrir el
-- mapa, pero NO reemplaza a la dirección escrita.
ALTER TABLE "sales"
  ADD COLUMN "delivery_address" TEXT,
  ADD COLUMN "delivery_notes" TEXT,
  ADD COLUMN "delivery_lat" DOUBLE PRECISION,
  ADD COLUMN "delivery_lng" DOUBLE PRECISION;

-- Un domicilio SIN dirección es un pedido que nadie puede entregar; y una venta
-- de mostrador o para recoger no tiene por qué llevar una.
ALTER TABLE "sales"
  ADD CONSTRAINT "chk_sale_delivery_address"
  CHECK (
    ("type" = 'WEB_DELIVERY' AND "delivery_address" IS NOT NULL AND length(btrim("delivery_address")) > 0)
    OR ("type" <> 'WEB_DELIVERY' AND "delivery_address" IS NULL)
  );

-- Las coordenadas van juntas o no van.
ALTER TABLE "sales"
  ADD CONSTRAINT "chk_sale_delivery_coords"
  CHECK (("delivery_lat" IS NULL) = ("delivery_lng" IS NULL));
