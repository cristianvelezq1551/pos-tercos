-- Revocación de sesión: el access JWT lleva `tv` (token_version); el guard lo
-- compara contra este valor. Incrementar invalida TODOS los access vigentes del
-- usuario al instante (desactivar, cambiar rol, reset de password) — antes el
-- token de 24h sobrevivía a la baja.
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
