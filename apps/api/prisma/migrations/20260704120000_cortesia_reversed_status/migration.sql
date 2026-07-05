-- Cortesías auto-aprobadas + reversa del admin (#5). Nuevo valor de enum para
-- marcar una cortesía anulada por error (devuelve stock, sale del COGS).
-- ADD VALUE va en su propia migración (Postgres no permite usar un valor de enum
-- nuevo en la misma transacción que lo agrega).
ALTER TYPE "CortesiaStatus" ADD VALUE IF NOT EXISTS 'REVERSED';
