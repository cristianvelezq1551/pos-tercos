-- Costos fijos del negocio (alquiler, servicios, software, etc.). Usados por el
-- reporte de estado financiero mensual. Soportan frecuencia MENSUAL o ANUAL
-- (la ANUAL se prorratea ÷12 al mostrarse). Vigencia desde/hasta opcional
-- para soportar cambios (subió el arriendo, terminó el contrato).
CREATE TYPE "FixedCostFrequency" AS ENUM ('MONTHLY', 'ANNUAL');

CREATE TABLE "fixed_costs" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "frequency" "FixedCostFrequency" NOT NULL DEFAULT 'MONTHLY',
    "category" TEXT NOT NULL DEFAULT 'Otros',
    "started_at" DATE,
    "ended_at" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT "fixed_costs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fixed_costs_amount_chk" CHECK ("amount" >= 0),
    CONSTRAINT "fixed_costs_vigencia_chk" CHECK ("ended_at" IS NULL OR "started_at" IS NULL OR "ended_at" >= "started_at")
);

CREATE INDEX "fixed_costs_active_idx" ON "fixed_costs"("is_active");
