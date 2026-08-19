-- Costo del domicilio (2026-07-17). Decisión del dueño: el cliente transfiere
-- UN solo monto (comida + envío), así que el envío TIENE que estar en el total
-- o `confirmPayment` —que valida monto exacto— lo rechazaría.
--
-- El valor NO lo calcula el sistema: el cajero le pregunta la tarifa al
-- domiciliario por otro chat y la carga a mano. Por eso arranca en 0 y se
-- asigna después de creado el pedido.
--
-- Contablemente SÍ es ingreso: el reparto es un servicio que el negocio vende.
-- Lo que se le paga al domiciliario es un GASTO aparte, que el dueño registra en
-- su módulo (compromiso/nómina). Así tesorería cuadra sola —deriva ingresos de
-- sale_payments y gastos de los módulos— sin que nadie tenga que excluir nada.
--
-- Se evaluó tratarlo como plata en tránsito ("pass-through") y NO se puede: el
-- sistema tiene dos bolsillos (Efectivo/Cuenta), no un concepto de pasivo. Esa
-- vía dejaba tesorería inflada en el valor del envío, por pedido y acumulándose.
ALTER TABLE "sales" ADD COLUMN "delivery_fee" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Solo un domicilio puede tener envío. Una venta de mostrador con envío es un bug.
ALTER TABLE "sales"
  ADD CONSTRAINT "chk_sale_delivery_fee"
  CHECK ("delivery_fee" >= 0 AND ("delivery_fee" = 0 OR "type" = 'WEB_DELIVERY'));

-- El total deja de ser (subtotal − descuento): ahora suma el envío. Las filas
-- viejas tienen delivery_fee = 0, así que siguen cumpliendo.
ALTER TABLE "sales" DROP CONSTRAINT "sales_total_matches_breakdown";
ALTER TABLE "sales"
  ADD CONSTRAINT "sales_total_matches_breakdown"
  CHECK (abs("total" - ("subtotal" - "discount_total" + "delivery_fee")) < 0.01);
