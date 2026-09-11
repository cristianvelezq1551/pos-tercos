-- Marca de "costo estimado al escribir" en las entradas de inventario (§7.v70).
-- PURAMENTE ADITIVA: ADD COLUMN con default no volátil es O(1) desde Postgres 11
-- (no reescribe una sola fila) y deja `false` en todo lo ya cargado, que es
-- exactamente su comportamiento actual. El trigger insert-only de la tabla
-- bloquea UPDATE/DELETE, no ALTER.
ALTER TABLE "inventory_movements" ADD COLUMN "unit_cost_estimated" BOOLEAN NOT NULL DEFAULT false;
