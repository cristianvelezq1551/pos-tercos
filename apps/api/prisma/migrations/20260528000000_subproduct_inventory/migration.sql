-- ============================================================================
-- Inventario de SUBPRODUCTOS — paso 1: agregar valores de enum.
-- ============================================================================
--
-- PostgreSQL exige commitear nuevos valores de enum antes de poder usarlos
-- en CHECK constraints. Por eso este cambio se parte en 2 migrations: ésta
-- agrega los valores, y la siguiente los usa.
-- ----------------------------------------------------------------------------

ALTER TYPE "StockableType" ADD VALUE IF NOT EXISTS 'SUBPRODUCT';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'PRODUCTION';
