-- Cutover POS→admin (2026-07-21). La app apps/pos se retira; toda la operación
-- de caja vive en el admin, que solo admite ADMIN_OPERATIVO y DUENO. El rol
-- CAJERO ya no puede entrar a ninguna app → los cajeros reales pasan a
-- ADMIN_OPERATIVO (el "cajero de confianza"). Decisión del dueño (auditoría
-- pre-QA §0.5): reasignar, NO permitir CAJERO con gate por sección.
--
-- El valor de enum CAJERO se conserva (dormido) para no arriesgar una migración
-- de enum con datos; esta sola reasigna las filas. Idempotente: correrla de
-- nuevo no toca nada (no quedan filas CAJERO).
UPDATE "users" SET "role" = 'ADMIN_OPERATIVO' WHERE "role" = 'CAJERO';
