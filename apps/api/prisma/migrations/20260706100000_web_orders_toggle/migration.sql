-- #13 Anti-abuso del pedido web — kill-switch: el dueño apaga POST /web/orders
-- al instante desde el admin (sin deploy). El límite por teléfono/día vive en
-- código (no necesita schema).
ALTER TABLE "business_config" ADD COLUMN "web_orders_enabled" BOOLEAN NOT NULL DEFAULT true;
