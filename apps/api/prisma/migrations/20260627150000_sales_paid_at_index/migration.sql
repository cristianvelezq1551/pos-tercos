-- Índice sobre sales.paid_at: los reportes financieros (P&G, dashboard, COGS,
-- finance-summary) filtran por rango de paid_at en cada request. Sin él, esos
-- queries hacen seq scan de toda la tabla de ventas a medida que crece.
CREATE INDEX IF NOT EXISTS "sales_paid_at_idx" ON "sales" ("paid_at");
