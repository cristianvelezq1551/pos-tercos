-- Medios de pago configurables por el admin: qué métodos están habilitados
-- en el POS. El catálogo de métodos sigue siendo el enum (no se inventan
-- métodos arbitrarios); acá solo se prende/apaga y se ordena.
CREATE TABLE "payment_method_settings" (
  "method" "PaymentMethod" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_method_settings_pkey" PRIMARY KEY ("method")
);

-- Defaults del negocio: SOLO efectivo y transferencia activos.
INSERT INTO "payment_method_settings" ("method", "enabled", "sort_order") VALUES
  ('CASH', true, 1),
  ('TRANSFER', true, 2),
  ('CARD', false, 3),
  ('NEQUI', false, 4),
  ('DAVIPLATA', false, 5),
  ('QR_BANCOLOMBIA', false, 6);
