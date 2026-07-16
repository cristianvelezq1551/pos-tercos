-- Zona de cobertura de los pedidos web (2026-07-16).
-- El dueño define un radio en km desde el local; la web mide con el GPS del
-- navegador y el server revalida al crear el pedido.
--
-- Igual que con el horario, el switch arranca APAGADO: prenderlo tiene que ser
-- un acto deliberado y no empezar a rechazar pedidos reales el día del deploy.

ALTER TABLE "business_config"
  ADD COLUMN "order_radius_km" DOUBLE PRECISION NOT NULL DEFAULT 10,
  ADD COLUMN "orders_respect_radius" BOOLEAN NOT NULL DEFAULT false;

-- El radio tiene que ser un número con sentido: 0 no es zona de cobertura y
-- más de 100 km es un error de tipeo, no una decisión de negocio.
ALTER TABLE "business_config"
  ADD CONSTRAINT "chk_order_radius_km" CHECK ("order_radius_km" > 0 AND "order_radius_km" <= 100);
