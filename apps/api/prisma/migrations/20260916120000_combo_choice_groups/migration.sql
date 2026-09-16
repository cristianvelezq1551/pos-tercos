-- Un combo podía llevar SOLO componentes fijos, así que "2 Double Smash + 2
-- Pepsi" descontaba Pepsi aunque el cliente se llevara Coca-Cola: la elección
-- no existía en el modelo y cada venta dejaba el inventario torcido.
--
-- Estas tablas permiten que un componente sea "una de estas opciones". Van
-- SEPARADAS de `combo_components` a propósito: un combo sin grupos recorre
-- exactamente el mismo código de antes, y todo lo que hoy lee los componentes
-- fijos sigue leyendo lo mismo.
--
-- Puramente aditiva: no reescribe una sola fila.

CREATE TABLE "combo_choice_groups" (
    "id" TEXT NOT NULL,
    "combo_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "combo_choice_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "combo_choice_options" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "price_delta" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "combo_choice_options_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "combo_choice_groups_combo_id_idx" ON "combo_choice_groups"("combo_id");
CREATE INDEX "combo_choice_options_product_id_idx" ON "combo_choice_options"("product_id");

-- Una opción no se repite dentro de su grupo: ofrecer dos veces la misma
-- bebida deja a quien vende eligiendo entre filas idénticas.
CREATE UNIQUE INDEX "combo_choice_options_group_id_product_id_key"
  ON "combo_choice_options"("group_id", "product_id");

ALTER TABLE "combo_choice_groups"
  ADD CONSTRAINT "combo_choice_groups_combo_id_fkey"
  FOREIGN KEY ("combo_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "combo_choice_options"
  ADD CONSTRAINT "combo_choice_options_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "combo_choice_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT: un producto que es opción de un combo no se borra por accidente y
-- deja al combo sin qué descontar.
ALTER TABLE "combo_choice_options"
  ADD CONSTRAINT "combo_choice_options_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un grupo que pide 0 unidades dejaría el consumo sin definir.
ALTER TABLE "combo_choice_groups"
  ADD CONSTRAINT "chk_combo_choice_group_qty" CHECK ("quantity" > 0);

-- El recargo nunca abarata: una opción que baje el precio del combo es una
-- promoción, y para eso está el motor de promociones.
ALTER TABLE "combo_choice_options"
  ADD CONSTRAINT "chk_combo_choice_option_price_delta" CHECK ("price_delta" >= 0);

-- Snapshot de lo elegido, congelado en la línea: mismo criterio que
-- `modifiers_json`. Es la FUENTE del consumo de stock — sin él, cambiar mañana
-- las opciones del combo reescribiría lo que ya se vendió.
-- ADD COLUMN con default no volátil es O(1) desde PG 11: no reescribe filas.
ALTER TABLE "sale_items"
  ADD COLUMN "choices_json" JSONB NOT NULL DEFAULT '[]';

-- Una cortesía también sale del inventario: sin la elección congelada, regalar
-- un combo con grupos no sabría qué bebida descontar.
ALTER TABLE "cortesia_requests"
  ADD COLUMN "choices_json" JSONB NOT NULL DEFAULT '[]';
